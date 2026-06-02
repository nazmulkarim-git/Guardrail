import {
  apiError,
  authenticateRequest,
  compactEscalation,
  getSql,
  json,
  publicApiError,
  requireMethod
} from "../../_forsig-core.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;

  try {
    const db = getSql();
    const auth = await authenticateRequest(req, db);
    if (!auth.ok) {
      apiError(res, auth.status, auth.code, auth.message);
      return;
    }

    const id = req.query?.id;
    const rows = await db`
      select
        e.*,
        d.status as decision_status,
        d.instruction as decision_instruction,
        d.added_context_json as decision_added_context,
        d.comment as decision_comment,
        d.reviewer_name as decision_reviewer_name,
        d.reviewer_channel as decision_reviewer_channel,
        d.created_at as decision_created_at
      from escalations e
      left join lateral (
        select *
        from decisions
        where escalation_id = e.id
        order by created_at desc
        limit 1
      ) d on true
      where e.id = ${id}
        and e.workspace_id = ${auth.workspaceId}
      limit 1
    `;

    if (!rows[0]) {
      apiError(res, 404, "escalation_not_found", "Escalation not found.");
      return;
    }

    json(res, 200, { ok: true, escalation: compactEscalation(rows[0]) });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Get escalation failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
