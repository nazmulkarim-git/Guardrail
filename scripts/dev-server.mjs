import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  ".svg": "image/svg+xml; charset=utf-8"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
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
      subject: "You are on the Forsig waitlist",
      html: `
        <div style="font-family:Inter,Arial,sans-serif;background:#08090d;color:#f7f7fb;padding:32px;border-radius:18px">
          <h1 style="margin:0 0 12px;font-size:28px">You are on the Forsig waitlist.</h1>
          <p style="line-height:1.6;color:#c9cbd8">Thanks for joining. Forsig is the human approval layer for autonomous AI agents. We are prioritizing early access for builders creating agents that need human judgment before risky actions.</p>
          <p style="line-height:1.6;color:#c9cbd8">The private beta focuses on escalation requests, approval inboxes, reviewer decisions, edited instructions, agent resume responses, and audit trails.</p>
          <p style="color:#8e94aa">- The Forsig team</p>
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

function handleConfig(_req, res) {
  send(res, 200, JSON.stringify({
    posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
    posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com"
  }));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
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
  if (req.method === "GET" && req.url?.startsWith("/api/config")) {
    handleConfig(req, res);
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
