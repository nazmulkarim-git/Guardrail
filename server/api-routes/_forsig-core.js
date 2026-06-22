import postgres from "postgres";
import { createHash, createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

let sql;
const rateLimitBuckets = new Map();

export const DECISION_STATUSES = new Set([
  "approved",
  "rejected",
  "edited",
  "context_added",
  "taken_over",
  "needs_more_info",
  "expired",
  "canceled"
]);

export function getSql() {
  if (!process.env.DATABASE_URL) {
    const error = new Error("DATABASE_URL is not configured.");
    error.code = "missing_database_url";
    throw error;
  }
  if (!sql) {
    sql = postgres(process.env.DATABASE_URL, {
      max: 2,
      prepare: false,
      ssl: process.env.DATABASE_SSL === "false" ? false : "require"
    });
  }
  return sql;
}

export function json(res, status, body) {
  res.status(status).json(body);
}

export function readBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body || {};
}

export function normalizeString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader("allow", method);
  json(res, 405, { ok: false, error: { type: "forsig_api_error", code: "method_not_allowed", message: "Method not allowed." } });
  return false;
}

export function publicApiError(error) {
  if (error.code === "missing_database_url") {
    return { status: 503, code: "missing_database_url", message: "DATABASE_URL is not configured." };
  }
  if (error.code === "42P01") {
    return { status: 500, code: "missing_product_table", message: "Forsig product tables are not created yet." };
  }
  if (error.code === "42703") {
    return { status: 500, code: "product_schema_mismatch", message: "Forsig product tables are missing expected columns." };
  }
  if (error.code === "28P01") {
    return { status: 500, code: "database_auth_failed", message: "The database rejected the configured credentials." };
  }
  if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
    return { status: 500, code: "database_connection_failed", message: "Forsig could not connect to the database." };
  }
  return { status: 500, code: error.code || "forsig_api_failed", message: "Forsig API request failed." };
}

export function parseBearer(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  if (!header || typeof header !== "string") return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, decodeURIComponent(value.join("=") || "")];
    }).filter(([key]) => key)
  );
}

export function requestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || "unknown";
  return req.socket?.remoteAddress || "unknown";
}

export function checkRateLimit(req, res, key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucketKey = `${key}:${requestIp(req)}`;
  const bucket = rateLimitBuckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateLimitBuckets.set(bucketKey, bucket);
  res.setHeader("x-ratelimit-limit", String(limit));
  res.setHeader("x-ratelimit-remaining", String(Math.max(0, limit - bucket.count)));
  if (bucket.count <= limit) return true;
  apiError(res, 429, "rate_limited", "Too many requests. Try again shortly.");
  return false;
}

export function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin || typeof origin !== "string") return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function signValue(value) {
  const configuredSecret = process.env.FORSIG_ADMIN_SESSION_SECRET || process.env.REFERRAL_INVITE_SECRET || process.env.FORSIG_API_KEY;
  if (!configuredSecret && process.env.NODE_ENV === "production") {
    throw new Error("FORSIG_ADMIN_SESSION_SECRET is required in production.");
  }
  const secret = configuredSecret || "forsig-dev-session-secret";
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function verifySignedValue(value, signature) {
  if (!value || !signature) return false;
  const expected = signValue(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAdminSessionCookie() {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const value = `admin.${expiresAt}.${randomBytes(16).toString("hex")}`;
  const signature = signValue(value);
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `forsig_admin=${encodeURIComponent(`${value}.${signature}`)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7};${secure}`;
}

export function clearAdminSessionCookie() {
  return "forsig_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0;";
}

export function createDeveloperSessionCookie(developer) {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 14;
  const value = `dev.${developer.id}.${developer.workspace_id}.${expiresAt}`;
  const signature = signValue(value);
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `forsig_dev=${encodeURIComponent(`${value}.${signature}`)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14};${secure}`;
}

export function clearDeveloperSessionCookie() {
  return "forsig_dev=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0;";
}

export function isAdminAuthenticated(req) {
  const session = parseCookies(req).forsig_admin;
  if (!session) return false;
  const parts = session.split(".");
  if (parts.length !== 4) return false;
  const value = parts.slice(0, 3).join(".");
  const signature = parts[3];
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return verifySignedValue(value, signature);
}

export function requireAdmin(req, res) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isSameOrigin(req)) {
    apiError(res, 403, "same_origin_required", "Admin actions must come from the Forsig app.");
    return false;
  }
  if (isAdminAuthenticated(req)) return true;
  apiError(res, 401, "admin_auth_required", "Admin login is required.");
  return false;
}

export function getDeveloperSession(req) {
  const session = parseCookies(req).forsig_dev;
  if (!session) return null;
  const parts = session.split(".");
  if (parts.length !== 5) return null;
  const value = parts.slice(0, 4).join(".");
  const signature = parts[4];
  const expiresAt = Number(parts[3]);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  if (!verifySignedValue(value, signature)) return null;
  return {
    id: parts[1],
    workspaceId: parts[2],
    expiresAt
  };
}

export function requireDeveloper(req, res) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isSameOrigin(req)) {
    apiError(res, 403, "same_origin_required", "Developer actions must come from the Forsig app.");
    return null;
  }
  const session = getDeveloperSession(req);
  if (session) return session;
  apiError(res, 401, "developer_auth_required", "Developer login is required.");
  return null;
}

export function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
}

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== "string") return false;
  const [algorithm, iterations, salt, hash] = storedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !hash) return false;
  const expected = pbkdf2Sync(String(password), salt, Number(iterations), 32, "sha256").toString("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateApiKey(prefix = "fsk_beta") {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

export function generateTemporaryPassword() {
  return `Forsig-${randomBytes(5).toString("base64url")}`;
}

export async function authenticateRequest(req, db = getSql()) {
  const token = parseBearer(req);
  if (!token) {
    return { ok: false, status: 401, code: "missing_api_key", message: "Missing Bearer API key." };
  }

  const envKey = process.env.FORSIG_API_KEY || process.env.FORSIG_BETA_API_KEY;
  if (envKey && token === envKey) {
    return {
      ok: true,
      workspaceId: process.env.FORSIG_DEFAULT_WORKSPACE_ID || "workspace_beta",
      apiKeyId: "env_api_key",
      mode: "env"
    };
  }

  const keyHash = hashApiKey(token);
  const rows = await db`
    select id, workspace_id
    from api_keys
    where hashed_key = ${keyHash}
      and revoked_at is null
      and held_at is null
    limit 1
  `;
  const apiKey = rows[0];
  if (!apiKey) {
    return { ok: false, status: 401, code: "invalid_api_key", message: "Invalid or revoked Forsig API key." };
  }

  await db`update api_keys set last_used_at = now() where id = ${apiKey.id}`;
  return { ok: true, workspaceId: apiKey.workspace_id, apiKeyId: apiKey.id, mode: "database" };
}

export function apiError(res, status, code, message) {
  json(res, status, {
    ok: false,
    error: {
      type: "forsig_api_error",
      code,
      message
    }
  });
}

export function newId(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function toJson(value) {
  if (value === undefined) return null;
  return value ?? null;
}

export function compactEscalation(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    agent: {
      id: row.external_agent_id,
      name: row.agent_name
    },
    runId: row.run_id,
    workflow: row.workflow_name,
    step: row.workflow_step,
    risk: {
      type: row.risk_type,
      level: row.risk_level,
      reason: row.risk_reason
    },
    task: {
      title: row.task_title,
      description: row.task_description,
      proposedAction: row.proposed_action,
      customerImpact: row.customer_impact
    },
    context: row.context_json,
    reviewer: {
      assignedEmail: row.assigned_reviewer_email || null
    },
    testMode: row.test_mode || null,
    expiresAt: row.timeout_at || null,
    decision: row.decision_status ? {
      status: row.decision_status,
      instruction: row.decision_instruction,
      addedContext: row.decision_added_context,
      comment: row.decision_comment,
      reviewer: {
        name: row.decision_reviewer_name,
        channel: row.decision_reviewer_channel
      },
      createdAt: row.decision_created_at
    } : null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    updatedAt: row.updated_at
  };
}

export async function sendEmail({ to, replyTo, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.WAITLIST_FROM_EMAIL || "Forsig <hello@forsig.com>",
      to: Array.isArray(to) ? to : [to],
      reply_to: replyTo || process.env.WAITLIST_REPLY_TO || "hello@forsig.com",
      subject,
      html
    })
  });

  if (!response.ok) {
    return { sent: false, status: response.status, body: await response.text() };
  }
  return { sent: true, response: await response.json() };
}

export async function sendSlackNotification({ text, blocks }) {
  const webhookUrl = process.env.FORSIG_SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: "FORSIG_SLACK_WEBHOOK_URL not configured" };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, blocks })
  });

  if (!response.ok) {
    return { sent: false, status: response.status, body: await response.text() };
  }
  return { sent: true };
}

export function webhookSignature(payload) {
  const secret = process.env.FORSIG_WEBHOOK_SECRET || process.env.FORSIG_ADMIN_SESSION_SECRET || process.env.FORSIG_API_KEY || "forsig-dev-webhook-secret";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function deliverResolutionWebhook(db, { workspaceId, escalationId, decision, event = "escalation.resolved" }) {
  const rows = await db`
    select id, callback_url, status, external_agent_id, agent_name, run_id, task_title
    from escalations
    where id = ${escalationId}
      and workspace_id = ${workspaceId}
    limit 1
  `;
  const escalation = rows[0];
  if (!escalation?.callback_url) return { sent: false, reason: "No callback URL configured" };

  const payload = JSON.stringify({
    event,
    escalation: {
      id: escalation.id,
      status: escalation.status,
      agent: {
        id: escalation.external_agent_id,
        name: escalation.agent_name
      },
      runId: escalation.run_id,
      title: escalation.task_title
    },
    decision
  });

  try {
    const response = await fetch(escalation.callback_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forsig-event": event,
        "x-forsig-signature": webhookSignature(payload)
      },
      body: payload
    });
    const body = response.ok ? null : await response.text();
    await db`
      insert into notification_attempts (
        id,
        workspace_id,
        escalation_id,
        channel,
        recipient,
        status,
        error,
        created_at,
        sent_at
      )
      values (
        ${newId("note")},
        ${workspaceId},
        ${escalationId},
        'webhook',
        ${escalation.callback_url},
        ${response.ok ? 'sent' : 'failed'},
        ${response.ok ? null : body || `HTTP ${response.status}`},
        now(),
        ${response.ok ? new Date() : null}
      )
    `.catch(() => null);
    return { sent: response.ok, status: response.status, body };
  } catch (error) {
    await db`
      insert into notification_attempts (
        id,
        workspace_id,
        escalation_id,
        channel,
        recipient,
        status,
        error,
        created_at
      )
      values (
        ${newId("note")},
        ${workspaceId},
        ${escalationId},
        'webhook',
        ${escalation.callback_url},
        'failed',
        ${error.message || "Webhook delivery failed"},
        now()
      )
    `.catch(() => null);
    return { sent: false, error: error.message };
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
