import { apiError, getSql, json, normalizeString, publicApiError, readBody, requireDeveloper } from "../_forsig-core.js";

export default async function handler(req, res) {
  const session = requireDeveloper(req, res);
  if (!session) return;

  try {
    const db = getSql();

    if (req.method === "POST") {
      const body = readBody(req);
      const name = normalizeString(body.name);
      if (!name) {
        apiError(res, 400, "workspace_name_required", "Workspace name is required.");
        return;
      }
      await db`
        update workspaces
        set name = ${name}, updated_at = now()
        where id = ${session.workspaceId}
      `;
    } else if (req.method !== "GET") {
      res.setHeader("allow", "GET, POST");
      apiError(res, 405, "method_not_allowed", "Method not allowed.");
      return;
    }

    const rows = await db`
      select
        w.*,
        (select count(*)::int from escalations where workspace_id = w.id and status = 'pending') as pending_count,
        (select count(*)::int from escalations where workspace_id = w.id) as escalation_count,
        (select count(*)::int from api_keys where workspace_id = w.id and revoked_at is null and held_at is null) as active_key_count
      from workspaces w
      where w.id = ${session.workspaceId}
      limit 1
    `;
    json(res, 200, { ok: true, workspace: rows[0] || null });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer workspace failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
