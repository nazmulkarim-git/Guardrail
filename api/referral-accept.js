import postgres from "postgres";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

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

function inviteSecret() {
  return process.env.REFERRAL_INVITE_SECRET || process.env.RESEND_API_KEY || "forsig-dev-referral-secret";
}

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.forsig.com";
  return `${proto}://${host}`;
}

function makeReferralCode(email, id) {
  const prefix = email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "AGENT";
  return `FS-${prefix}-${id.slice(-5).toUpperCase()}`;
}

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function verifyToken(token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", inviteSecret()).update(encoded).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

async function sendEmail({ to, replyTo, subject, html }) {
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY not configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.WAITLIST_FROM_EMAIL || "Forsig <hello@forsig.com>",
      to: [to],
      reply_to: replyTo || process.env.WAITLIST_REPLY_TO || "hello@forsig.com",
      subject,
      html
    })
  });
  if (!response.ok) return { sent: false, status: response.status, body: await response.text() };
  return { sent: true, response: await response.json() };
}

async function sendConfirmationEmail({ email, referralCode, referralLink, inviterEmail }) {
  return sendEmail({
    to: email,
    subject: "You accepted a Forsig private beta invite",
    html: `
      <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
        <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
          <p style="margin:0 0 12px;color:#5ef0a4;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig early access</p>
          <h1 style="margin:0 0 16px;font-size:30px;line-height:1.1">You are on the Forsig waitlist.</h1>
          <p style="color:#c9cedd;line-height:1.65">You accepted an invite from <strong>${escapeHtml(inviterEmail)}</strong>. Forsig is the budget firewall and kill switch for AI agents.</p>
          <div style="margin:22px 0;padding:18px;border:1px solid rgba(215,255,114,.22);border-radius:14px;background:rgba(215,255,114,.06)">
            <p style="margin:0 0 10px;color:#d7ff72;font-weight:800">Your referral code: ${escapeHtml(referralCode)}</p>
            <p style="margin:0;color:#c9cedd;line-height:1.6">Share this link to move up the waitlist:</p>
            <p style="margin:8px 0 0;word-break:break-all"><a href="${escapeHtml(referralLink)}" style="color:#d7ff72">${escapeHtml(referralLink)}</a></p>
          </div>
          <p style="margin-top:24px;color:#8f96aa">The Forsig team</p>
        </div>
      </div>
    `
  });
}

async function sendReferralNotification({ referrerEmail, referredEmail }) {
  return sendEmail({
    to: referrerEmail,
    subject: "You moved up the Forsig waitlist",
    html: `
      <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
        <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
          <p style="margin:0 0 12px;color:#d7ff72;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig referral</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.1">Thanks for sharing Forsig.</h1>
          <p style="color:#c9cedd;line-height:1.65">${escapeHtml(referredEmail)} accepted your referral invite. You moved up in the list.</p>
        </div>
      </div>
    `
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.status(405).send("Method not allowed.");
    return;
  }

  try {
    const origin = getOrigin(req);
    const token = new URL(req.url, origin).searchParams.get("token");
    const payload = verifyToken(token);
    if (!payload || !isEmail(payload.email) || !payload.referralCode || !payload.inviterLeadId || !payload.inviterEmail) {
      res.status(400).send("Invalid referral invite.");
      return;
    }

    const db = getSql();
    const email = payload.email.trim().toLowerCase();
    const leadId = `lead_${randomUUID().replaceAll("-", "")}`;
    const ownReferralCode = makeReferralCode(email, leadId);
    const rows = await db`
      insert into waitlist_leads (
        id,
        email,
        referral_code,
        own_referral_code,
        source_section,
        utm_source,
        utm_medium,
        utm_campaign,
        signup_count,
        user_agent,
        created_at,
        updated_at
      )
      values (
        ${leadId},
        ${email},
        ${payload.referralCode},
        ${ownReferralCode},
        ${"referral_invite_accept"},
        ${"referral"},
        ${"email"},
        ${"founding_500"},
        1,
        ${req.headers["user-agent"] || null},
        now(),
        now()
      )
      on conflict (email) do update set
        referral_code = coalesce(waitlist_leads.referral_code, excluded.referral_code),
        own_referral_code = coalesce(waitlist_leads.own_referral_code, excluded.own_referral_code),
        source_section = excluded.source_section,
        utm_source = coalesce(waitlist_leads.utm_source, excluded.utm_source),
        utm_medium = coalesce(waitlist_leads.utm_medium, excluded.utm_medium),
        utm_campaign = coalesce(waitlist_leads.utm_campaign, excluded.utm_campaign),
        signup_count = waitlist_leads.signup_count + 1,
        updated_at = now()
      returning id, email, own_referral_code, signup_count
    `;

    const savedLead = rows[0];
    const referralLink = `${origin}/?utm_source=referral&utm_medium=waitlist&utm_campaign=founding_500&ref=${encodeURIComponent(savedLead.own_referral_code)}`;
    await Promise.allSettled([
      sendConfirmationEmail({
        email,
        referralCode: savedLead.own_referral_code,
        referralLink,
        inviterEmail: payload.inviterEmail
      }),
      sendReferralNotification({
        referrerEmail: payload.inviterEmail,
        referredEmail: email
      })
    ]);

    const params = new URLSearchParams({ lead: savedLead.id, code: savedLead.own_referral_code });
    res.writeHead(302, { location: `/thanks?${params.toString()}` });
    res.end();
  } catch (error) {
    console.error("Referral accept failed", {
      code: error.code,
      name: error.name,
      message: error.message,
      detail: error.detail
    });
    res.status(500).send("Referral invite could not be accepted. Please try again.");
  }
}
