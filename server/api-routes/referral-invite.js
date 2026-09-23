import postgres from "postgres";
import { createHmac } from "node:crypto";

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

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.forsig.com";
  return `${proto}://${host}`;
}

function inviteSecret() {
  const secret = process.env.REFERRAL_INVITE_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("REFERRAL_INVITE_SECRET is required in production.");
  }
  return secret || "forsig-dev-referral-secret";
}

function signPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", inviteSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function normalizeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseEmails(value) {
  return [...new Set(
    normalizeString(value)
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendInvite({ to, inviterEmail, referralCode, acceptLink, landingLink }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.WAITLIST_FROM_EMAIL || "Forsig <hello@forsig.com>",
      to: [to],
      reply_to: process.env.WAITLIST_REPLY_TO || "hello@forsig.com",
      subject: `${inviterEmail} thought Forsig might be useful for you`,
      html: `
        <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
          <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
            <p style="margin:0 0 12px;color:#d7ff72;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig referral</p>
            <h1 style="margin:0 0 16px;font-size:28px;line-height:1.1">A quick personal invite to Forsig.</h1>
            <p style="color:#c9cedd;line-height:1.65"><strong>${escapeHtml(inviterEmail)}</strong> thought you might care about Forsig, so I wanted to make this invite feel clear and useful.</p>
            <p style="color:#c9cedd;line-height:1.65">Forsig is for teams building AI agents that should pause before risky actions, ask a human for a decision, and then continue with an audit trail.</p>
            <p style="color:#c9cedd;line-height:1.65">If you are building agents for support, sales, ops, finance, or internal tools, I would love to have you on the early access list. Clicking below will add <strong>${escapeHtml(to)}</strong> automatically with referral code <strong>${escapeHtml(referralCode)}</strong>.</p>
            <p style="margin:26px 0">
              <a href="${escapeHtml(acceptLink)}" style="display:inline-block;background:#d7ff72;color:#10110d;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:800">Accept invite</a>
            </p>
            <p style="color:#8f96aa;line-height:1.55">Want to inspect it first? Here is the landing page: <a href="${escapeHtml(landingLink)}" style="color:#d7ff72">${escapeHtml(landingLink)}</a></p>
            <p style="color:#8f96aa;line-height:1.55">If you were not expecting this invite, you can ignore this email.</p>
            <p style="margin-top:24px;color:#8f96aa">Founder, Forsig</p>
          </div>
        </div>
      `
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
    if (!process.env.RESEND_API_KEY) {
      res.status(503).json({ ok: false, error: "Email sending is not configured." });
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const leadId = normalizeString(body.leadId);
    const referralCode = normalizeString(body.referralCode);
    const emails = parseEmails(body.inviteEmails);

    if (!leadId || !referralCode) {
      res.status(400).json({ ok: false, error: "Referral sender and code are required." });
      return;
    }

    if (!emails.length) {
      res.status(400).json({ ok: false, error: "Enter at least one email address." });
      return;
    }

    const invalid = emails.filter((email) => !isEmail(email));
    if (invalid.length) {
      res.status(400).json({ ok: false, error: `Invalid email: ${invalid[0]}` });
      return;
    }

    if (emails.length > 10) {
      res.status(400).json({ ok: false, error: "Send up to 10 referral emails at a time." });
      return;
    }

    const db = getSql();
    const inviterRows = await db`
      select id, email, own_referral_code
      from waitlist_leads
      where id = ${leadId}
        and own_referral_code = ${referralCode}
      limit 1
    `;
    const inviter = inviterRows[0];
    if (!inviter) {
      res.status(404).json({ ok: false, error: "Referral sender was not found." });
      return;
    }

    const registeredRows = await db`
      select email
      from waitlist_leads
      where email in ${db(emails)}
    `;
    const registeredEmails = new Set(registeredRows.map((row) => row.email));
    const inviteEmails = emails.filter((email) => email !== inviter.email && !registeredEmails.has(email));

    if (!inviteEmails.length) {
      res.status(409).json({ ok: false, error: "All entered emails are already registered for early access." });
      return;
    }

    const origin = getOrigin(req);
    const landingLink = `${origin}/`;
    const results = await Promise.allSettled(
      inviteEmails.map((email) => {
        const token = signPayload({
          email,
          referralCode,
          inviterLeadId: leadId,
          inviterEmail: inviter.email,
          createdAt: Date.now()
        });
        return sendInvite({
          to: email,
          inviterEmail: inviter.email,
          referralCode,
          acceptLink: `${origin}/api/referral-accept?token=${encodeURIComponent(token)}`,
          landingLink
        });
      })
    );
    const sent = results.filter((result) => result.status === "fulfilled" && result.value.sent).length;

    if (!sent) {
      res.status(502).json({ ok: false, error: "No referral emails were sent. Please try again." });
      return;
    }

    res.status(200).json({
      ok: true,
      sent,
      requested: emails.length,
      skippedRegistered: emails.length - inviteEmails.length
    });
  } catch (error) {
    console.error("Referral invites failed", {
      code: error.code,
      name: error.name,
      message: error.message
    });
    res.status(500).json({ ok: false, error: "Referral emails could not be sent. Please try again." });
  }
}
