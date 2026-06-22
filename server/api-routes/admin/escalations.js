import { apiError, compactEscalation, getSql, json, publicApiError, requireAdmin } from "../_forsig-core.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    const db = getSql();
    const status = req.query?.status || "pending";
    const statusFilter = status === "all" ? null : status;

    const rows = await db`
      select
        e.*,
        w.name as workspace_name,
        du.email as developer_email,
        d.status as decision_status,
        d.instruction as decision_instruction,
        d.added_context_json as decision_added_context,
        d.comment as decision_comment,
        d.reviewer_name as decision_reviewer_name,
        d.reviewer_channel as decision_reviewer_channel,
        d.created_at as decision_created_at
      from escalations e
      left join workspaces w on w.id = e.workspace_id
      left join developer_users du on du.workspace_id = e.workspace_id
      left join lateral (
        select *
        from decisions
        where escalation_id = e.id
        order by created_at desc
        limit 1
      ) d on true
      where (${statusFilter}::text is null or e.status = ${statusFilter})
      order by e.created_at desc
      limit 250
    `;

    const counts = await db`
      select
        count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status = 'approved')::int as approved,
        count(*) filter (where status = 'rejected')::int as rejected,
        count(*) filter (where status = 'edited')::int as edited,
        count(*)::int as total
      from escalations
    `;

    json(res, 200, {
      ok: true,
      counts: counts[0],
      escalations: rows.map((row) => ({
        ...compactEscalation(row),
        workspace: {
          id: row.workspace_id,
          name: row.workspace_name || row.workspace_id
        },
        developerEmail: row.developer_email || null
      }))
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Admin escalations failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
