import { apiError, compactEscalation, getSql, json, publicApiError, requireAdmin } from "../../_forsig-core.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    const db = getSql();
    const workspaceId = process.env.FORSIG_DEFAULT_WORKSPACE_ID || "workspace_beta";
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
        and e.workspace_id = ${workspaceId}
      limit 1
    `;

    if (!rows[0]) {
      apiError(res, 404, "escalation_not_found", "Escalation not found.");
      return;
    }

    const [events, decisions] = await Promise.all([
      db`
        select id, actor_type, actor_id, event_type, metadata_json, created_at
        from audit_events
        where escalation_id = ${id}
          and workspace_id = ${workspaceId}
        order by created_at desc
        limit 50
      `,
      db`
        select id, reviewer_user_id, reviewer_name, reviewer_channel, status, instruction, added_context_json, comment, created_at
        from decisions
        where escalation_id = ${id}
          and workspace_id = ${workspaceId}
        order by created_at desc
      `
    ]);

    json(res, 200, {
      ok: true,
      escalation: compactEscalation(rows[0]),
      auditEvents: events,
      decisions
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Admin escalation detail failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}

