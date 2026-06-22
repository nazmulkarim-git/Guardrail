import { apiError, getSql, json, newId, publicApiError, readBody, requireDeveloper, toJson } from "../../../_forsig-core.js";

export default async function handler(req, res) {
  const session = requireDeveloper(req, res);
  if (!session) return;
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    const db = getSql();
    const id = req.query?.id;
    const body = readBody(req);
    const hold = body.hold !== false;
    const rows = await db`
      update api_keys
      set held_at = case when ${hold}::boolean then now() else null end
      where id = ${id}
        and workspace_id = ${session.workspaceId}
        and revoked_at is null
      returning id, name, prefix, held_at, revoked_at
    `;
    if (!rows[0]) {
      apiError(res, 404, "api_key_not_found", "Active API key not found.");
      return;
    }
    await db`
      insert into audit_events (id, workspace_id, escalation_id, actor_type, actor_id, event_type, metadata_json, created_at)
      values (${newId("audit")}, ${session.workspaceId}, null, 'user', ${session.id}, ${hold ? 'api_key.held' : 'api_key.unheld'}, ${toJson({ keyId: id, prefix: rows[0].prefix })}, now())
    `;
    json(res, 200, { ok: true, key: rows[0] });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer hold API key failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
