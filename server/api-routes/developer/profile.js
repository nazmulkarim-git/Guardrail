import { apiError, getSql, json, normalizeString, publicApiError, readBody, requireDeveloper } from "../_forsig-core.js";

export default async function handler(req, res) {
  const session = requireDeveloper(req, res);
  if (!session) return;

  try {
    const db = getSql();

    if (req.method === "POST") {
      const body = readBody(req);
      const name = normalizeString(body.name);
      const company = normalizeString(body.company);
      await db`
        update developer_users
        set name = ${name || null},
            company = ${company || null},
            updated_at = now()
        where id = ${session.id}
          and workspace_id = ${session.workspaceId}
          and status = 'active'
      `;
    } else if (req.method !== "GET") {
      res.setHeader("allow", "GET, POST");
      apiError(res, 405, "method_not_allowed", "Method not allowed.");
      return;
    }

    const rows = await db`
      select id, email, name, company, last_login_at, created_at, updated_at
      from developer_users
      where id = ${session.id}
        and workspace_id = ${session.workspaceId}
        and status = 'active'
      limit 1
    `;
    json(res, 200, { ok: true, profile: rows[0] || null });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer profile failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
