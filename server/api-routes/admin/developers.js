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

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const db = getSql();

    if (req.method === "GET") {
      const developers = await db`
        select
          d.id,
          d.workspace_id,
          d.email,
          d.name,
          d.company,
          d.status,
          d.password_set_at,
          d.must_reset_password,
          d.last_login_at,
          d.created_at,
          w.name as workspace_name,
          (select count(*)::int from api_keys where workspace_id = d.workspace_id and revoked_at is null) as active_key_count,
          (select count(*)::int from agents where workspace_id = d.workspace_id and archived_at is null) as agent_count,
          (select count(*)::int from escalations where workspace_id = d.workspace_id) as escalation_count,
          (select count(*)::int from escalations where workspace_id = d.workspace_id and status = 'pending') as pending_count,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', a.id,
              'name', a.name,
              'slug', a.slug,
              'environment', a.environment,
              'escalationCount', (
                select count(*)::int
                from escalations e
                where e.workspace_id = a.workspace_id
                  and e.external_agent_id = a.slug
              )
            ) order by a.created_at desc)
            from agents a
            where a.workspace_id = d.workspace_id
              and a.archived_at is null
          ), '[]'::jsonb) as agents
        from developer_users d
        join workspaces w on w.id = d.workspace_id
        order by d.created_at desc
        limit 100
      `;
      json(res, 200, { ok: true, developers });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      apiError(res, 405, "method_not_allowed", "Method not allowed.");
      return;
    }

    const body = readBody(req);
    const email = normalizeString(body.email)?.toLowerCase();
    if (!email || !isEmail(email)) {
      apiError(res, 400, "invalid_developer_email", "A valid developer email is required.");
      return;
    }

    const existing = await db`
      select id, email, status
      from developer_users
      where email = ${email}
      limit 1
    `;
    if (existing[0]) {
      apiError(res, 409, "developer_already_invited", "This developer already has beta access.");
      return;
    }

    const name = normalizeString(body.name);
    const company = normalizeString(body.company);
    const workspaceName =
      normalizeString(body.workspaceName) ||
      normalizeString(body.workspace_name) ||
      company ||
      name ||
      `${email.split("@")[0]} workspace`;
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
      console.error("Developer invite email failed", { email, message: error.message });
      return { sent: false, error: error.message };
    });

    json(res, 201, {
      ok: true,
      developer: {
        id: developerId,
        workspaceId,
        workspaceName,
        email,
        name,
        company,
        accessCode,
        loginUrl: "/developer"
      },
      inviteEmail: { sent: Boolean(inviteEmail.sent) }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Admin developers failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
