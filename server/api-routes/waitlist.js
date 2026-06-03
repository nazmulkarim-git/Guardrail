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

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.forsig.com";
  return `${proto}://${host}`;
}

async function getWaitlistPosition(db, createdAt) {
  const rows = await db`
    select count(*)::int as position
    from waitlist_leads
    where created_at <= ${createdAt}
  `;
  return Number(rows[0]?.position || 1);
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
        subject: "I saved your spot for Forsig",
        html: `
          <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
            <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
              <p style="margin:0 0 12px;color:#5ef0a4;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig private beta</p>
              <h1 style="margin:0 0 16px;font-size:30px;line-height:1.1">I saved your spot.</h1>
              <p style="color:#c9cedd;line-height:1.65">Thanks for joining the Forsig waitlist. I am building Forsig for teams that want AI agents to pause at risky moments, ask a human, and continue with a clear decision trail.</p>
              <p style="color:#c9cedd;line-height:1.65">Early access will go first to builders who are already shipping, testing, or planning agent workflows where a refund, message, record change, deployment, or billing action should not happen without human judgment.</p>
              <p style="color:#c9cedd;line-height:1.65">If that sounds like what you are building, just reply to this email and tell me what your agent does. I read these replies personally.</p>
              <div style="margin:22px 0;padding:18px;border:1px solid rgba(215,255,114,.22);border-radius:14px;background:rgba(215,255,114,.06)">
                <p style="margin:0 0 10px;color:#d7ff72;font-weight:800">Your referral code: ${escapeHtml(lead.referralCode || "")}</p>
                <p style="margin:0;color:#c9cedd;line-height:1.6">If you know another builder who needs human approval for agents, send them this link. It helps me find the right early users and moves you up the list.</p>
                <p style="margin:8px 0 0;word-break:break-all"><a href="${escapeHtml(lead.referralLink || "")}" style="color:#d7ff72">${escapeHtml(lead.referralLink || "")}</a></p>
              </div>
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
            <p><strong>Preferred approval channel:</strong> ${escapeHtml(lead.provider || "-")}</p>
            <p><strong>Plan interest:</strong> ${escapeHtml(lead.planInterest || "-")}</p>
            <p><strong>Framework:</strong> ${escapeHtml(lead.frameworkInterest || "-")}</p>
            <p><strong>External actions:</strong> ${escapeHtml(lead.externalActions || "-")}</p>
            <p><strong>Risky actions to review:</strong> ${escapeHtml(lead.monthlyAiSpend || "-")}</p>
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
        subject: "Your Forsig referral helped",
        html: `
          <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
            <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
              <p style="margin:0 0 12px;color:#d7ff72;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig referral</p>
              <h1 style="margin:0 0 16px;font-size:28px;line-height:1.1">Someone joined from your invite.</h1>
              <p style="color:#c9cedd;line-height:1.65">A builder joined the Forsig private beta waitlist using your referral code, so I moved you up in the list.</p>
              <p style="color:#c9cedd;line-height:1.65">This helps a lot. I am trying to get Forsig in front of people who have real agent workflows and real approval problems, not just passive curiosity.</p>
              <p style="color:#8f96aa">Referred signup: ${escapeHtml(referredEmail)}</p>
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
      source: normalizeString(body.source) || normalizeString(body.sourceSection) || "landing",
      planInterest: normalizeString(body.planInterest) || normalizeString(body.plan_interest),
      frameworkInterest: normalizeString(body.frameworkInterest) || normalizeString(body.framework_interest),
      externalActions: normalizeString(body.externalActions) || normalizeString(body.external_actions),
      founderCallInterest: normalizeString(body.founderCallInterest) || normalizeString(body.founder_call_interest),
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
        source,
        plan_interest,
        framework_interest,
        external_actions,
        founder_call_interest,
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
        ${lead.source},
        ${lead.planInterest},
        ${lead.frameworkInterest},
        ${lead.externalActions},
        ${lead.founderCallInterest},
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
        source = coalesce(excluded.source, waitlist_leads.source),
        plan_interest = coalesce(excluded.plan_interest, waitlist_leads.plan_interest),
        framework_interest = coalesce(excluded.framework_interest, waitlist_leads.framework_interest),
        external_actions = coalesce(excluded.external_actions, waitlist_leads.external_actions),
        founder_call_interest = coalesce(excluded.founder_call_interest, waitlist_leads.founder_call_interest),
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
    const position = await getWaitlistPosition(db, savedLead.created_at);
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

    if (duplicate) {
      await capturePostHog("waitlist_duplicate_attempted", { ...lead, leadId: savedLead.id, ownReferralCode: savedLead.own_referral_code, position }, savedLead.email);
      res.status(200).json({
        ok: true,
        duplicate: true,
        message: "This email is already registered for early access.",
        leadId: savedLead.id,
        referralCode: savedLead.own_referral_code,
        position
      });
      return;
    }

    const [emailResult, ownerResult, analyticsResult] = await Promise.allSettled([
      sendConfirmationEmail({
        email,
        referralCode: savedLead.own_referral_code,
        referralLink: `${getOrigin(req)}/?utm_source=referral&utm_medium=waitlist&utm_campaign=founding_500&ref=${encodeURIComponent(savedLead.own_referral_code)}`
      }),
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
      position,
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
