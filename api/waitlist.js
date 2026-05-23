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

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || null;
  return req.socket?.remoteAddress || null;
}

function makeReferralCode(email, id) {
  const prefix = email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "AGENT";
  return `FS-${prefix}-${id.slice(-5).toUpperCase()}`;
}

function publicDatabaseError(error) {
  if (error.code === "missing_database_url") {
    return {
      status: 503,
      code: "missing_database_url",
      message: "DATABASE_URL is not configured in Vercel production."
    };
  }

  if (error.code === "42P01") {
    return {
      status: 500,
      code: "missing_waitlist_table",
      message: "The waitlist_leads table does not exist in the configured database."
    };
  }

  if (error.code === "42703") {
    return {
      status: 500,
      code: "waitlist_schema_mismatch",
      message: "The waitlist_leads table is missing one or more expected columns."
    };
  }

  if (error.code === "28P01") {
    return {
      status: 500,
      code: "database_auth_failed",
      message: "The database rejected the configured username or password."
    };
  }

  if (error.code === "3D000") {
    return {
      status: 500,
      code: "database_not_found",
      message: "The configured database name does not exist."
    };
  }

  if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
    return {
      status: 500,
      code: "database_connection_failed",
      message: "The waitlist API could not connect to the configured database host."
    };
  }

  return {
    status: 500,
    code: error.code || error.name || "waitlist_signup_failed",
    message: "Waitlist signup failed. Check Vercel function logs for details."
  };
}

async function capturePostHog(event, properties, distinctId) {
  const apiKey = process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
  if (!apiKey) return { captured: false, reason: "POSTHOG_KEY not configured" };

  try {
    const response = await fetch(`${host.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties
      })
    });

    if (!response.ok) {
      return { captured: false, status: response.status, body: await response.text() };
    }
    return { captured: true };
  } catch (error) {
    console.error("PostHog capture failed", { event, message: error.message });
    return { captured: false, error: error.message };
  }
}

async function sendConfirmationEmail(lead) {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  try {
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
          <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
            <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
              <p style="margin:0 0 12px;color:#5ef0a4;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig early access</p>
              <h1 style="margin:0 0 16px;font-size:30px;line-height:1.1">You are on the Forsig waitlist.</h1>
              <p style="color:#c9cedd;line-height:1.65">Thanks for joining. Forsig is the budget firewall and kill switch for AI agents. We are prioritizing early access for builders already running or preparing agent traffic.</p>
              <p style="color:#c9cedd;line-height:1.65">Soon you will be able to add Forsig in seconds: change the base URL, swap in a virtual key, and get budgets, token counts, audit logs, custom instruction records, and emergency pause controls.</p>
              <p style="margin-top:24px;color:#8f96aa">The Forsig team</p>
            </div>
          </div>
        `
      })
    });

    if (!response.ok) {
      return { sent: false, status: response.status, body: await response.text() };
    }
    return { sent: true, response: await response.json() };
  } catch (error) {
    console.error("Resend confirmation failed", { email: lead.email, message: error.message });
    return { sent: false, error: error.message };
  }
}

async function sendOwnerNotification(lead) {
  const ownerEmail = process.env.WAITLIST_OWNER_EMAIL || "thenazmulkarim@gmail.com";
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.WAITLIST_FROM_EMAIL || "Forsig <hello@forsig.com>",
        to: [ownerEmail],
        reply_to: lead.email,
        subject: `New Forsig waitlist signup: ${lead.email}`,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;color:#111827">
            <h2>New Forsig waitlist signup</h2>
            <p><strong>Name:</strong> ${escapeHtml(lead.name || "-")}</p>
            <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
            <p><strong>Company:</strong> ${escapeHtml(lead.company || "-")}</p>
            <p><strong>Role:</strong> ${escapeHtml(lead.role || "-")}</p>
            <p><strong>Provider:</strong> ${escapeHtml(lead.provider || "-")}</p>
            <p><strong>Monthly AI spend:</strong> ${escapeHtml(lead.monthlyAiSpend || "-")}</p>
            <p><strong>Use case:</strong></p>
            <p>${escapeHtml(lead.useCase || "-")}</p>
            <p><strong>Source:</strong> ${escapeHtml(lead.utmSource || "direct")} / ${escapeHtml(lead.utmMedium || "-")} / ${escapeHtml(lead.utmCampaign || "-")}</p>
          </div>
        `
      })
    });

    if (!response.ok) {
      return { sent: false, status: response.status, body: await response.text() };
    }
    return { sent: true, response: await response.json() };
  } catch (error) {
    console.error("Owner waitlist notification failed", { email: lead.email, message: error.message });
    return { sent: false, error: error.message };
  }
}

async function sendReferralNotification(referrer, referredEmail) {
  if (!referrer?.email || !process.env.RESEND_API_KEY) {
    return { sent: false, reason: "missing referrer email or RESEND_API_KEY" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.WAITLIST_FROM_EMAIL || "Forsig <hello@forsig.com>",
        to: [referrer.email],
        reply_to: process.env.WAITLIST_REPLY_TO || "hello@forsig.com",
        subject: "You moved up the Forsig waitlist",
        html: `
          <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
            <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
              <p style="margin:0 0 12px;color:#d7ff72;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig referral</p>
              <h1 style="margin:0 0 16px;font-size:28px;line-height:1.1">Thanks for sharing Forsig.</h1>
              <p style="color:#c9cedd;line-height:1.65">Someone joined the private beta waitlist using your referral code. You moved up in the list.</p>
              <p style="color:#8f96aa">Referred signup: ${escapeHtml(referredEmail)}</p>
            </div>
          </div>
        `
      })
    });

    if (!response.ok) {
      return { sent: false, status: response.status, body: await response.text() };
    }
    return { sent: true, response: await response.json() };
  } catch (error) {
    console.error("Referral notification failed", { email: referrer.email, message: error.message });
    return { sent: false, error: error.message };
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (!isEmail(body.email)) {
      res.status(400).json({ ok: false, error: "Valid email is required." });
      return;
    }

    const email = body.email.trim().toLowerCase();
    const lead = {
      id: `lead_${randomUUID().replaceAll("-", "")}`,
      email,
      name: normalizeString(body.name),
      company: normalizeString(body.company),
      role: normalizeString(body.role),
      provider: normalizeString(body.provider),
      useCase: normalizeString(body.useCase),
      monthlyAiSpend: normalizeString(body.monthlyAiSpend),
      urgency: null,
      painPoint: normalizeString(body.painPoint),
      utmSource: normalizeString(body.utmSource),
      utmMedium: normalizeString(body.utmMedium),
      utmCampaign: normalizeString(body.utmCampaign),
      referralCode: normalizeString(body.referralCode),
      referrer: normalizeString(body.referrer),
      sourceSection: normalizeString(body.sourceSection) || "landing_waitlist",
      viewport: normalizeString(body.viewport),
      userAgent: req.headers["user-agent"] || null,
      ipAddress: getIp(req)
    };

    const db = getSql();
    const ownReferralCode = makeReferralCode(email, lead.id);
    const rows = await db`
      insert into waitlist_leads (
        id,
        email,
        name,
        company,
        role,
        provider,
        use_case,
        monthly_ai_spend,
        urgency,
        pain_point,
        utm_source,
        utm_medium,
        utm_campaign,
        referral_code,
        own_referral_code,
        referrer,
        source_section,
        viewport,
        user_agent,
        ip_address,
        signup_count,
        created_at,
        updated_at
      )
      values (
        ${lead.id},
        ${lead.email},
        ${lead.name},
        ${lead.company},
        ${lead.role},
        ${lead.provider},
        ${lead.useCase},
        ${lead.monthlyAiSpend},
        ${lead.urgency},
        ${lead.painPoint},
        ${lead.utmSource},
        ${lead.utmMedium},
        ${lead.utmCampaign},
        ${lead.referralCode},
        ${ownReferralCode},
        ${lead.referrer},
        ${lead.sourceSection},
        ${lead.viewport},
        ${lead.userAgent},
        ${lead.ipAddress},
        1,
        now(),
        now()
      )
      on conflict (email) do update set
        name = coalesce(excluded.name, waitlist_leads.name),
        company = coalesce(excluded.company, waitlist_leads.company),
        role = coalesce(excluded.role, waitlist_leads.role),
        provider = coalesce(excluded.provider, waitlist_leads.provider),
        use_case = coalesce(excluded.use_case, waitlist_leads.use_case),
        monthly_ai_spend = coalesce(excluded.monthly_ai_spend, waitlist_leads.monthly_ai_spend),
        urgency = coalesce(excluded.urgency, waitlist_leads.urgency),
        pain_point = coalesce(excluded.pain_point, waitlist_leads.pain_point),
        utm_source = coalesce(excluded.utm_source, waitlist_leads.utm_source),
        utm_medium = coalesce(excluded.utm_medium, waitlist_leads.utm_medium),
        utm_campaign = coalesce(excluded.utm_campaign, waitlist_leads.utm_campaign),
        referral_code = coalesce(excluded.referral_code, waitlist_leads.referral_code),
        own_referral_code = coalesce(waitlist_leads.own_referral_code, excluded.own_referral_code),
        referrer = coalesce(excluded.referrer, waitlist_leads.referrer),
        source_section = coalesce(excluded.source_section, waitlist_leads.source_section),
        viewport = coalesce(excluded.viewport, waitlist_leads.viewport),
        user_agent = coalesce(excluded.user_agent, waitlist_leads.user_agent),
        ip_address = coalesce(excluded.ip_address, waitlist_leads.ip_address),
        signup_count = waitlist_leads.signup_count + 1,
        updated_at = now()
      returning id, email, signup_count, own_referral_code, created_at, updated_at
    `;

    const savedLead = rows[0];
    const duplicate = Number(savedLead.signup_count) > 1;
    let referrer = null;
    if (lead.referralCode) {
      const normalizedReferral = lead.referralCode.trim();
      const referrerRows = await db`
        select id, email, own_referral_code
        from waitlist_leads
        where own_referral_code = ${normalizedReferral}
          and email <> ${email}
        limit 1
      `;
      referrer = referrerRows[0] || null;
    }

    const [emailResult, ownerResult, analyticsResult] = await Promise.allSettled([
      sendConfirmationEmail({ email }),
      sendOwnerNotification(lead),
      capturePostHog("waitlist_signup_succeeded", { ...lead, leadId: savedLead.id, ownReferralCode: savedLead.own_referral_code, referredByMatched: Boolean(referrer), duplicate }, savedLead.email)
    ]);
    const referralResult = referrer ? await sendReferralNotification(referrer, email) : { sent: false };
    const emailStatus = emailResult.status === "fulfilled" ? emailResult.value : { sent: false, error: emailResult.reason?.message };
    const ownerStatus = ownerResult.status === "fulfilled" ? ownerResult.value : { sent: false, error: ownerResult.reason?.message };
    const analyticsStatus = analyticsResult.status === "fulfilled" ? analyticsResult.value : { captured: false, error: analyticsResult.reason?.message };

    res.status(200).json({
      ok: true,
      leadId: savedLead.id,
      referralCode: savedLead.own_referral_code,
      duplicate,
      email: {
        sent: Boolean(emailStatus.sent)
      },
      ownerNotification: {
        sent: Boolean(ownerStatus.sent)
      },
      analytics: {
        captured: Boolean(analyticsStatus.captured)
      },
      referralNotification: {
        sent: Boolean(referralResult.sent)
      }
    });
  } catch (error) {
    const publicError = publicDatabaseError(error);
    console.error("Waitlist signup failed", {
      code: error.code,
      name: error.name,
      message: error.message,
      detail: error.detail,
      hint: error.hint,
      publicCode: publicError.code
    });
    await capturePostHog("waitlist_signup_failed", { code: publicError.code, message: publicError.message }, "anonymous").catch(() => null);
    res.status(publicError.status).json({ ok: false, error: publicError.message, code: publicError.code });
  }
}
