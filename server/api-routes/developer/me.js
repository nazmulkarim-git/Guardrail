import { apiError, getSql, getDeveloperSession, json, publicApiError } from "../_forsig-core.js";

export default async function handler(req, res) {
  const session = getDeveloperSession(req);
  if (!session) {
    json(res, 200, { ok: true, authenticated: false });
    return;
  }

  try {
    const db = getSql();
    const rows = await db`
      select d.id, d.email, d.name, d.company, d.workspace_id, w.name as workspace_name
      from developer_users d
      join workspaces w on w.id = d.workspace_id
      where d.id = ${session.id}
        and d.workspace_id = ${session.workspaceId}
        and d.status = 'active'
      limit 1
    `;
    if (!rows[0]) {
      json(res, 200, { ok: true, authenticated: false });
      return;
    }
    json(res, 200, {
      ok: true,
      authenticated: true,
      developer: {
        id: rows[0].id,
        email: rows[0].email,
        name: rows[0].name,
        company: rows[0].company,
        workspaceId: rows[0].workspace_id,
        workspaceName: rows[0].workspace_name
      }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer me failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
