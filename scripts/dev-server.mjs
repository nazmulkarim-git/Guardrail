import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webRoot = path.join(root, "apps", "web");
const dataDir = path.join(root, "data");
const waitlistPath = path.join(dataDir, "waitlist-leads.json");
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".mp4": "video/mp4"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

function vercelResponse(res) {
  return {
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    status(statusCode) {
      res.statusCode = statusCode;
      return this;
    },
    json(payload) {
      send(res, res.statusCode || 200, JSON.stringify(payload));
    }
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function loadLeads() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(waitlistPath)) return [];
  return JSON.parse(await readFile(waitlistPath, "utf8"));
}

async function saveLeads(leads) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(waitlistPath, `${JSON.stringify(leads, null, 2)}\n`, "utf8");
}

async function sendWaitlistEmail(lead) {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, provider: "resend", reason: "RESEND_API_KEY not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.WAITLIST_FROM_EMAIL || "Forsig <hello@forsig.com>",
      to: [lead.email],
      reply_to: process.env.WAITLIST_REPLY_TO || "hello@forsig.com",
      subject: "I saved your spot for Forsig",
      html: `
        <div style="font-family:Inter,Arial,sans-serif;background:#08090d;color:#f7f7fb;padding:32px;border-radius:18px">
          <h1 style="margin:0 0 12px;font-size:28px">I saved your spot.</h1>
          <p style="line-height:1.6;color:#c9cbd8">Thanks for joining the Forsig waitlist. I am building Forsig for teams that want AI agents to pause at risky moments, ask a human, and continue with a clear decision trail.</p>
          <p style="line-height:1.6;color:#c9cbd8">If you are building a real agent workflow, reply and tell me what it does. I read these replies personally.</p>
          <p style="color:#8e94aa">Founder, Forsig</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    return { sent: false, provider: "resend", status: response.status, body: await response.text() };
  }

  return { sent: true, provider: "resend", response: await response.json() };
}

async function handleWaitlist(req, res) {
  try {
    const body = await readJsonBody(req);
    if (!isEmail(body.email)) {
      send(res, 400, JSON.stringify({ ok: false, error: "Valid email is required." }));
      return;
    }

    const now = new Date().toISOString();
    const leads = await loadLeads();
    const email = body.email.trim().toLowerCase();
    const existingIndex = leads.findIndex((lead) => lead.email === email);
    const analytics = {
      utmSource: body.utmSource || null,
      utmMedium: body.utmMedium || null,
      utmCampaign: body.utmCampaign || null,
      referrer: body.referrer || null,
      viewport: body.viewport || null,
      userAgent: req.headers["user-agent"] || null,
      sourceSection: body.sourceSection || "unknown"
    };
    const lead = {
      id: existingIndex >= 0 ? leads[existingIndex].id : `lead_${crypto.randomUUID()}`,
      email,
      name: body.name || null,
      company: body.company || null,
      role: body.role || null,
      provider: body.provider || null,
      useCase: body.useCase || null,
      monthlyAiSpend: body.monthlyAiSpend || null,
      urgency: body.urgency || null,
      painPoint: body.painPoint || null,
      analytics,
      createdAt: existingIndex >= 0 ? leads[existingIndex].createdAt : now,
      updatedAt: now
    };

    const emailResult = await sendWaitlistEmail(lead);
    lead.emailConfirmation = {
      attemptedAt: now,
      ...emailResult
    };

    if (existingIndex >= 0) leads[existingIndex] = { ...leads[existingIndex], ...lead };
    else leads.push(lead);
    await saveLeads(leads);

    send(res, 200, JSON.stringify({ ok: true, duplicate: existingIndex >= 0, leadId: lead.id }));
  } catch (error) {
    send(res, 500, JSON.stringify({ ok: false, error: error.message || "Waitlist signup failed." }));
  }
}

async function runApiHandler(req, res, modulePath, query = {}) {
  if (req.method !== "GET") {
    req.body = await readJsonBody(req);
  }
  req.query = query;
  const mod = await import(pathToFileURL(path.join(root, modulePath)).href);
  await mod.default(req, vercelResponse(res));
}

function handleConfig(_req, res) {
  send(res, 200, JSON.stringify({
    posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
    posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    hotjarId: process.env.NEXT_PUBLIC_HOTJAR_ID || "",
    hotjarVersion: process.env.NEXT_PUBLIC_HOTJAR_VERSION || "6"
  }));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/app") pathname = "/app.html";
  if (pathname === "/developer") pathname = "/developer.html";
  if (pathname === "/docs") pathname = "/docs.html";
  if (pathname === "/dashboard") pathname = "/dashboard.html";
  if (pathname === "/thanks") pathname = "/thanks.html";
  if (pathname === "/contact") pathname = "/contact.html";
  if (pathname === "/privacy") pathname = "/privacy.html";
  if (pathname === "/terms") pathname = "/terms.html";
  if (pathname === "/security") pathname = "/security.html";

  const filePath = path.join(webRoot, pathname);
  if (!filePath.startsWith(webRoot)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  try {
    const ext = path.extname(filePath);
    const file = await readFile(filePath);
    send(res, 200, file, contentTypes[ext] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rewrittenApiPath = url.pathname === "/api" && url.searchParams.get("path");
  const apiPathname = rewrittenApiPath ? `/api/${rewrittenApiPath.replace(/^\/+/, "")}` : url.pathname;

  if (req.method === "GET" && req.url?.startsWith("/api/config")) {
    handleConfig(req, res);
    return;
  }

  if (apiPathname === "/api/v1/escalations") {
    await runApiHandler(req, res, path.join("server", "api-routes", "v1", "escalations.js"));
    return;
  }

  const adminRoutes = new Map([
    ["/api/admin/login", path.join("server", "api-routes", "admin", "login.js")],
    ["/api/admin/logout", path.join("server", "api-routes", "admin", "logout.js")],
    ["/api/admin/me", path.join("server", "api-routes", "admin", "me.js")],
    ["/api/admin/workspace", path.join("server", "api-routes", "admin", "workspace.js")],
    ["/api/admin/api-key", path.join("server", "api-routes", "admin", "api-key.js")],
    ["/api/admin/developers", path.join("server", "api-routes", "admin", "developers.js")],
    ["/api/admin/escalations", path.join("server", "api-routes", "admin", "escalations.js")]
  ]);

  if (adminRoutes.has(apiPathname)) {
    await runApiHandler(req, res, adminRoutes.get(apiPathname), Object.fromEntries(url.searchParams.entries()));
    return;
  }

  const adminDecisionMatch = apiPathname.match(/^\/api\/admin\/escalations\/([^/]+)\/decision$/);
  if (adminDecisionMatch) {
    await runApiHandler(req, res, path.join("server", "api-routes", "admin", "escalations", "[id]", "decision.js"), { id: adminDecisionMatch[1] });
    return;
  }

  const adminEscalationMatch = apiPathname.match(/^\/api\/admin\/escalations\/([^/]+)$/);
  if (adminEscalationMatch) {
    await runApiHandler(req, res, path.join("server", "api-routes", "admin", "escalations", "[id].js"), { id: adminEscalationMatch[1] });
    return;
  }

  const developerRoutes = new Map([
    ["/api/developer/login", path.join("server", "api-routes", "developer", "login.js")],
    ["/api/developer/logout", path.join("server", "api-routes", "developer", "logout.js")],
    ["/api/developer/me", path.join("server", "api-routes", "developer", "me.js")],
    ["/api/developer/workspace", path.join("server", "api-routes", "developer", "workspace.js")],
    ["/api/developer/agents", path.join("server", "api-routes", "developer", "agents.js")],
    ["/api/developer/api-key", path.join("server", "api-routes", "developer", "api-key.js")],
    ["/api/developer/test-escalation", path.join("server", "api-routes", "developer", "test-escalation.js")],
    ["/api/developer/escalations", path.join("server", "api-routes", "developer", "escalations.js")]
  ]);

  if (developerRoutes.has(apiPathname)) {
    await runApiHandler(req, res, developerRoutes.get(apiPathname), Object.fromEntries(url.searchParams.entries()));
    return;
  }

  const developerKeyRevokeMatch = apiPathname.match(/^\/api\/developer\/api-key\/([^/]+)\/revoke$/);
  if (developerKeyRevokeMatch) {
    await runApiHandler(req, res, path.join("server", "api-routes", "developer", "api-key", "[id]", "revoke.js"), { id: developerKeyRevokeMatch[1] });
    return;
  }

  const developerAgentMatch = apiPathname.match(/^\/api\/developer\/agents\/([^/]+)$/);
  if (developerAgentMatch) {
    await runApiHandler(req, res, path.join("server", "api-routes", "developer", "agents", "[id].js"), { id: developerAgentMatch[1] });
    return;
  }

  const developerDecisionMatch = apiPathname.match(/^\/api\/developer\/escalations\/([^/]+)\/decision$/);
  if (developerDecisionMatch) {
    await runApiHandler(req, res, path.join("server", "api-routes", "developer", "escalations", "[id]", "decision.js"), { id: developerDecisionMatch[1] });
    return;
  }

  const developerEscalationMatch = apiPathname.match(/^\/api\/developer\/escalations\/([^/]+)$/);
  if (developerEscalationMatch) {
    await runApiHandler(req, res, path.join("server", "api-routes", "developer", "escalations", "[id].js"), { id: developerEscalationMatch[1] });
    return;
  }

  const escalationDecisionMatch = apiPathname.match(/^\/api\/v1\/escalations\/([^/]+)\/decision$/);
  if (escalationDecisionMatch) {
    await runApiHandler(req, res, path.join("server", "api-routes", "v1", "escalations", "[id]", "decision.js"), { id: escalationDecisionMatch[1] });
    return;
  }

  const escalationCancelMatch = apiPathname.match(/^\/api\/v1\/escalations\/([^/]+)\/cancel$/);
  if (escalationCancelMatch) {
    await runApiHandler(req, res, path.join("server", "api-routes", "v1", "escalations", "[id]", "cancel.js"), { id: escalationCancelMatch[1] });
    return;
  }

  const escalationMatch = apiPathname.match(/^\/api\/v1\/escalations\/([^/]+)$/);
  if (escalationMatch) {
    await runApiHandler(req, res, path.join("server", "api-routes", "v1", "escalations", "[id].js"), { id: escalationMatch[1] });
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/api/waitlist")) {
    await handleWaitlist(req, res);
    return;
  }

  await serveStatic(req, res);
}).listen(port, () => {
  console.log(`Forsig MVP running at http://localhost:${port}`);
});
