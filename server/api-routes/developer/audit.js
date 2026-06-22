import { apiError, getSql, json, publicApiError, requireDeveloper } from "../_forsig-core.js";

export default async function handler(req, res) {
  const session = requireDeveloper(req, res);
  if (!session) return;
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    const db = getSql();
    const events = await db`
      select
        a.id,
        a.escalation_id,
        a.actor_type,
        a.actor_id,
        a.event_type,
        a.metadata_json,
        a.created_at,
        e.task_title,
        e.status as escalation_status
      from audit_events a
      left join escalations e on e.id = a.escalation_id and e.workspace_id = a.workspace_id
      where a.workspace_id = ${session.workspaceId}
      order by a.created_at desc
      limit 100
    `;
    json(res, 200, { ok: true, events });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer audit failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
