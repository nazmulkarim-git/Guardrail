import { createServer } from "node:http";

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const adminPassword = process.env.FORSIG_ADMIN_PASSWORD;

if (!adminPassword) {
  console.error("Missing FORSIG_ADMIN_PASSWORD. Set BASE_URL and FORSIG_ADMIN_PASSWORD before running.");
  process.exit(1);
}

const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const developerEmail = process.env.E2E_DEVELOPER_EMAIL || `forsig-e2e-${runId}@example.com`;
let webhookPayload = null;

function fail(step, error) {
  console.error(`FAIL ${step}`);
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}, jar = {}) {
  const headers = {
    "content-type": "application/json",
    ...(jar.cookie ? { cookie: jar.cookie } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    jar.cookie = setCookie.split(",").map((part) => part.split(";")[0]).join("; ");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`${response.status} ${payload.error?.code || ""} ${payload.error?.message || JSON.stringify(payload)}`);
  }
  return payload;
}

async function startWebhookReceiver() {
  if (!baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1")) return { url: null, close: () => {} };

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    webhookPayload = {
      event: req.headers["x-forsig-event"],
      signature: req.headers["x-forsig-signature"],
      body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
    };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/forsig-webhook`,
    close: () => server.close()
  };
}

async function main() {
  const adminJar = {};
  const developerJar = {};
  const webhook = await startWebhookReceiver();

  try {
    console.log(`Running Forsig E2E smoke test against ${baseUrl}`);

    await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: adminPassword })
    }, adminJar);
    console.log("PASS admin login");

    const developerInvite = await request("/api/admin/developers", {
      method: "POST",
      body: JSON.stringify({
        email: developerEmail,
        name: "Forsig E2E Developer",
        company: "Forsig Smoke Test",
        workspaceName: `Forsig E2E ${runId}`
      })
    }, adminJar);
    assert(developerInvite.developer?.accessCode, "Developer access code was not returned.");
    console.log("PASS developer workspace invite");

    await request("/api/developer/login", {
      method: "POST",
      body: JSON.stringify({
        email: developerEmail,
        accessCode: developerInvite.developer.accessCode
      })
    }, developerJar);
    console.log("PASS developer login");

    await request("/api/developer/workspace", {
      method: "POST",
      body: JSON.stringify({ name: `Launch Workspace ${runId}` })
    }, developerJar);
    console.log("PASS workspace update");

    const agent = await request("/api/developer/agents", {
      method: "POST",
      body: JSON.stringify({
        name: "Refund Agent",
        slug: `refund-agent-${runId}`.slice(0, 64),
        environment: "production",
        defaultReviewerEmails: developerEmail,
        description: "Escalates risky refund decisions."
      })
    }, developerJar);
    assert(agent.agent?.slug, "Agent slug was not returned.");
    console.log("PASS agent creation");

    const key = await request("/api/developer/api-key", {
      method: "POST",
      body: JSON.stringify({ name: "E2E smoke key" })
    }, developerJar);
    assert(key.apiKey?.key, "API key was not returned.");
    console.log("PASS API key creation");

    const escalation = await request("/api/v1/escalations", {
      method: "POST",
      headers: { authorization: `Bearer ${key.apiKey.key}` },
      body: JSON.stringify({
        agent: { id: agent.agent.slug, name: "Refund Agent", environment: "production" },
        run: { id: `run_${runId}`, workflow: "refund-review-flow", step: "approval" },
        risk: { type: "refund_over_limit", level: "high", reason: "Refund exceeds policy limit." },
        task: {
          title: "Approve refund for customer #123",
          proposedAction: "Issue a $500 refund",
          customerImpact: true
        },
        context: { refundAmount: 500, customerTier: "VIP" },
        review: { notify: ["dashboard"], reviewerEmail: developerEmail },
        callbackUrl: webhook.url
      })
    });
    assert(escalation.status === "pending", "Escalation did not start pending.");
    console.log("PASS escalation created");

    const detail = await request(`/api/developer/escalations/${encodeURIComponent(escalation.id)}`, {}, developerJar);
    assert(detail.escalation?.status === "pending", "Developer detail did not show pending escalation.");
    console.log("PASS developer can see escalation");

    const decision = await request(`/api/developer/escalations/${encodeURIComponent(escalation.id)}/decision`, {
      method: "POST",
      body: JSON.stringify({
        status: "edited",
        instruction: "Offer store credit instead of cash.",
        comment: "E2E smoke decision"
      })
    }, developerJar);
    assert(decision.decision?.status === "edited", "Decision was not recorded.");
    console.log("PASS developer decision");

    const resolved = await request(`/api/v1/escalations/${encodeURIComponent(escalation.id)}`, {
      headers: { authorization: `Bearer ${key.apiKey.key}` }
    });
    assert(resolved.escalation?.status === "edited", "Agent API did not receive resolved escalation.");
    assert(resolved.escalation?.decision?.instruction?.includes("store credit"), "Resolved instruction was missing.");
    console.log("PASS agent retrieves decision");

    if (webhook.url) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert(webhookPayload?.event === "escalation.resolved", "Webhook was not delivered locally.");
      assert(webhookPayload?.signature, "Webhook signature missing.");
      console.log("PASS webhook callback");
    } else {
      console.log("SKIP webhook callback receiver for non-local BASE_URL");
    }

    const auto = await request("/api/v1/escalations", {
      method: "POST",
      headers: { authorization: `Bearer ${key.apiKey.key}` },
      body: JSON.stringify({
        agent: agent.agent.slug,
        risk: "agent_stuck",
        task: { title: "Auto approve smoke test", proposedAction: "Continue workflow" },
        review: { testMode: "auto_approve", notify: ["dashboard"] }
      })
    });
    await new Promise((resolve) => setTimeout(resolve, 5500));
    const autoResolved = await request(`/api/v1/escalations/${encodeURIComponent(auto.id)}`, {
      headers: { authorization: `Bearer ${key.apiKey.key}` }
    });
    assert(autoResolved.escalation?.status === "approved", "Auto approve test mode did not resolve.");
    console.log("PASS test mode auto approval");

    console.log("Forsig E2E smoke test passed.");
  } catch (error) {
    fail("e2e", error);
  } finally {
    webhook.close();
  }
}

main();
