import postgres from "postgres";
import { randomUUID } from "node:crypto";

let sql;

function getSql() {
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

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || null;
  return req.socket?.remoteAddress || null;
}

async function sendEmail({ to, replyTo, subject, html }) {
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
      to: [to],
      reply_to: replyTo,
      subject,
      html
    })
  });

  if (!response.ok) {
    return { sent: false, status: response.status, body: await response.text() };
  }
  return { sent: true, response: await response.json() };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const name = normalizeString(body.name);
    const email = normalizeString(body.email)?.toLowerCase();
    const company = normalizeString(body.company);
    const role = normalizeString(body.role);
    const message = normalizeString(body.message);

    if (!name) return res.status(400).json({ ok: false, error: "Name is required." });
    if (!isEmail(email)) return res.status(400).json({ ok: false, error: "Valid email is required." });
    if (!message) return res.status(400).json({ ok: false, error: "Message is required." });

    const id = `msg_${randomUUID().replaceAll("-", "")}`;
    const db = getSql();
    await db`
      insert into contact_messages (
        id,
        name,
        email,
        company,
        role,
        message,
        user_agent,
        ip_address,
        created_at
      )
      values (
        ${id},
        ${name},
        ${email},
        ${company},
        ${role},
        ${message},
        ${req.headers["user-agent"] || null},
        ${getIp(req)},
        now()
      )
    `;

    const ownerEmail = process.env.WAITLIST_OWNER_EMAIL || "thenazmulkarim@gmail.com";
    const ownerHtml = `
      <div style="font-family:Inter,Arial,sans-serif;color:#111827">
        <h2>New Forsig contact message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company || "-")}</p>
        <p><strong>Role:</strong> ${escapeHtml(role || "-")}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message)}</p>
      </div>
    `;

    const userHtml = `
      <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
        <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.1">Thanks for your message.</h1>
          <p style="color:#c9cedd;line-height:1.65">I read each Forsig email personally and reply personally. Thanks for taking the time to reach out.</p>
          <p style="color:#8f96aa">- Nazmul Karim</p>
        </div>
      </div>
    `;

    const [ownerResult, userResult] = await Promise.allSettled([
      sendEmail({
        to: ownerEmail,
        replyTo: email,
        subject: `Forsig contact: ${name}`,
        html: ownerHtml
      }),
      sendEmail({
        to: email,
        replyTo: ownerEmail,
        subject: "Thanks for contacting Forsig",
        html: userHtml
      })
    ]);

    res.status(200).json({
      ok: true,
      messageId: id,
      ownerEmail: { sent: ownerResult.status === "fulfilled" && Boolean(ownerResult.value.sent) },
      confirmationEmail: { sent: userResult.status === "fulfilled" && Boolean(userResult.value.sent) }
    });
  } catch (error) {
    console.error("Contact message failed", {
      code: error.code,
      name: error.name,
      message: error.message,
      detail: error.detail
    });
    res.status(500).json({ ok: false, error: "Message could not be sent. Please try again." });
  }
}
