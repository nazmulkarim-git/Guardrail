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
  requireAdmin
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
          d.last_login_at,
          d.created_at,
          w.name as workspace_name,
          (select count(*)::int from api_keys where workspace_id = d.workspace_id and revoked_at is null) as active_key_count,
          (select count(*)::int from escalations where workspace_id = d.workspace_id) as escalation_count,
          (select count(*)::int from escalations where workspace_id = d.workspace_id and status = 'pending') as pending_count
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
      }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Admin developers failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
