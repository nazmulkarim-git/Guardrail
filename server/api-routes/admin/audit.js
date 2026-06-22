import { apiError, getSql, json, publicApiError, requireAdmin } from "../_forsig-core.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    const db = getSql();
    const rows = await db`
      select
        a.id,
        a.workspace_id,
        w.name as workspace_name,
        a.escalation_id,
        e.task_title,
        e.status as escalation_status,
        e.test_mode,
        a.actor_type,
        a.actor_id,
        a.event_type,
        a.metadata_json,
        a.created_at
      from audit_events a
      left join workspaces w on w.id = a.workspace_id
      left join escalations e on e.id = a.escalation_id and e.workspace_id = a.workspace_id
      order by a.created_at desc
      limit 250
    `;
    json(res, 200, { ok: true, events: rows });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Admin audit failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
