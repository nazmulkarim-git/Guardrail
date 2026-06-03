import { apiError, authenticateRequest, getSql, json, newId, publicApiError, requireMethod, toJson } from "../../../_forsig-core.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;

  try {
    const db = getSql();
    const auth = await authenticateRequest(req, db);
    if (!auth.ok) {
      apiError(res, auth.status, auth.code, auth.message);
      return;
    }

    const id = req.query?.id;
    const rows = await db`
      update escalations
      set status = 'canceled',
          resolved_at = now(),
          updated_at = now()
      where id = ${id}
        and workspace_id = ${auth.workspaceId}
        and status = 'pending'
      returning *
    `;
    if (!rows[0]) {
      apiError(res, 404, "escalation_not_found", "Pending escalation not found.");
      return;
    }

    await db`
      insert into audit_events (id, workspace_id, escalation_id, actor_type, actor_id, event_type, metadata_json, created_at)
      values (${newId("audit")}, ${auth.workspaceId}, ${id}, 'api', ${auth.apiKeyId}, 'escalation.canceled', ${toJson({ apiKeyId: auth.apiKeyId })}, now())
    `;

    json(res, 200, {
      ok: true,
      escalation: {
        id: rows[0].id,
        status: rows[0].status,
        canceledAt: rows[0].resolved_at
      }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Cancel escalation failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
