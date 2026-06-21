import {
  apiError,
  generateApiKey,
  getSql,
  hashApiKey,
  json,
  newId,
  normalizeString,
  publicApiError,
  readBody,
  requireAdmin,
  sendEmail
} from "../_forsig-core.js";

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function createDeveloperAccess(db, req, input) {
  const email = normalizeString(input.email)?.toLowerCase();
  if (!email || !isEmail(email)) {
    const error = new Error("A valid developer email is required.");
    error.publicCode = "invalid_developer_email";
    throw error;
  }

  const existing = await db`
    select id
    from developer_users
    where email = ${email}
    limit 1
  `;
  if (existing[0]) {
    const error = new Error("This developer already has beta access.");
    error.publicCode = "developer_already_invited";
    throw error;
  }

  const name = normalizeString(input.name);
  const company = normalizeString(input.company);
  const workspaceName = normalizeString(input.workspaceName) || normalizeString(input.workspace_name) || company || name || `${email.split("@")[0]} workspace`;
  const workspaceId = newId("workspace");
  const developerId = newId("dev");
  const accessCode = generateApiKey("forsig_dev");

  await db.begin(async (tx) => {
    await tx`
      insert into workspaces (id, name, owner_email, created_at, updated_at)
      values (${workspaceId}, ${workspaceName}, ${email}, now(), now())
    `;
    await tx`
      insert into developer_users (
        id,
        workspace_id,
        email,
        name,
        company,
        access_code_hash,
        status,
        created_at,
        updated_at
      )
      values (
        ${developerId},
        ${workspaceId},
        ${email},
        ${name},
        ${company},
        ${hashApiKey(accessCode)},
        'active',
        now(),
        now()
      )
    `;
  });

  const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host || "www.forsig.com"}`;
  const inviteEmail = await sendEmail({
    to: email,
    subject: "Your Forsig private beta access",
    html: `
      <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
        <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
          <p style="margin:0 0 12px;color:#00ffc2;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig private beta</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.1">Your beta workspace is ready.</h1>
          <p style="color:#c9cedd;line-height:1.65">Open Forsig, enter your email and access code, then create your password.</p>
          <p><a href="${origin}/developer" style="display:inline-block;background:#00ffc2;color:#06120f;text-decoration:none;border-radius:10px;padding:12px 16px;font-weight:800">Open developer portal</a></p>
          <p style="color:#c9cedd"><strong>Email:</strong> ${email}</p>
          <p style="color:#d7ff72;font-size:18px;font-weight:800"><strong>Access code:</strong> ${accessCode}</p>
          <p style="color:#8f96aa">Private beta boundary: send only the context needed for review. Avoid secrets, credentials, unnecessary PII, and regulated data.</p>
        </div>
      </div>
    `
  }).catch((error) => {
    console.error("Waitlist invite email failed", { email, message: error.message });
    return { sent: false, error: error.message };
  });

  return {
    id: developerId,
    workspaceId,
    workspaceName,
    email,
    name,
    company,
    accessCode,
    loginUrl: "/developer",
    inviteEmail: { sent: Boolean(inviteEmail.sent) }
  };
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const db = getSql();

    if (req.method === "GET") {
      const rows = await db`
        select
          l.*,
          exists(select 1 from developer_users d where d.email = l.email) as has_beta_access
        from waitlist_leads l
        order by l.created_at desc
        limit 250
      `;
      json(res, 200, { ok: true, leads: rows });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      apiError(res, 405, "method_not_allowed", "Method not allowed.");
      return;
    }

    const body = readBody(req);
    let lead = null;
    const leadId = normalizeString(body.leadId) || normalizeString(body.lead_id);
    if (leadId) {
      const rows = await db`
        select *
        from waitlist_leads
        where id = ${leadId}
        limit 1
      `;
      lead = rows[0] || null;
      if (!lead) {
        apiError(res, 404, "lead_not_found", "Waitlist lead not found.");
        return;
      }
    }

    const developer = await createDeveloperAccess(db, req, {
      email: normalizeString(body.email) || lead?.email,
      name: normalizeString(body.name) || lead?.name,
      company: normalizeString(body.company) || lead?.company,
      workspaceName: normalizeString(body.workspaceName) || normalizeString(body.workspace_name) || lead?.company
    });

    json(res, 201, { ok: true, developer });
  } catch (error) {
    if (error.publicCode) {
      apiError(res, error.publicCode === "developer_already_invited" ? 409 : 400, error.publicCode, error.message);
      return;
    }
    const publicError = publicApiError(error);
    console.error("Admin waitlist failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
