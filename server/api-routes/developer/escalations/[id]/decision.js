import {
  DECISION_STATUSES,
  apiError,
  deliverResolutionWebhook,
  getSql,
  json,
  newId,
  normalizeString,
  publicApiError,
  readBody,
  requireDeveloper,
  toJson
} from "../../../_forsig-core.js";

function validateDecisionPayload(body) {
  const status = normalizeString(body.status);
  const instruction = normalizeString(body.instruction);
  const errors = [];
  if (!status || !DECISION_STATUSES.has(status)) {
    errors.push("Choose approve, reject, edit, context, takeover, more info, expire, or cancel.");
  }
  if (status !== "approved" && !instruction) {
    errors.push("Instruction is required unless status is approved.");
  }
  return {
    valid: errors.length === 0,
    errors,
    status,
    instruction: instruction || "Proceed with the proposed action.",
    addedContext: body.addedContext ?? body.added_context ?? null,
    comment: normalizeString(body.comment)
  };
}

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
    const parsed = validateDecisionPayload(readBody(req));
    if (!parsed.valid) {
      apiError(res, 400, "invalid_decision", parsed.errors.join(" "));
      return;
    }

    const developerRows = await db`
      select id, email, name
      from developer_users
      where id = ${session.id}
        and workspace_id = ${session.workspaceId}
        and status = 'active'
      limit 1
    `;
    const developer = developerRows[0];
    if (!developer) {
      apiError(res, 401, "developer_auth_required", "Developer login is required.");
      return;
    }

    const reviewerName = developer.name || developer.email;
    const decisionId = newId("dec");
    const auditId = newId("audit");

    const result = await db.begin(async (tx) => {
      const claimed = await tx`
        update escalations
        set status = ${parsed.status},
            resolved_at = now(),
            updated_at = now()
        where id = ${id}
          and workspace_id = ${session.workspaceId}
          and status = 'pending'
        returning id, workspace_id
      `;

      if (!claimed[0]) {
        const existing = await tx`
          select id, status
          from escalations
          where id = ${id}
            and workspace_id = ${session.workspaceId}
          limit 1
        `;
        return {
          ok: false,
          status: existing[0] ? 409 : 404,
          code: existing[0] ? "escalation_already_resolved" : "escalation_not_found",
          message: existing[0] ? "This escalation is already resolved." : "Escalation not found."
        };
      }

      const rows = await tx`
        insert into decisions (
          id, escalation_id, workspace_id, reviewer_user_id, reviewer_name,
          reviewer_channel, status, instruction, added_context_json, comment, created_at
        )
        values (
          ${decisionId}, ${id}, ${session.workspaceId}, ${developer.id}, ${reviewerName},
          'developer_portal', ${parsed.status}, ${parsed.instruction},
          ${toJson(parsed.addedContext)}, ${parsed.comment}, now()
        )
        returning *
      `;

      await tx`
        insert into audit_events (
          id, workspace_id, escalation_id, actor_type, actor_id,
          event_type, metadata_json, created_at
        )
        values (
          ${auditId}, ${session.workspaceId}, ${id}, 'user', ${developer.id},
          ${`decision.${parsed.status}`},
          ${toJson({ instruction: parsed.instruction, reviewerName })}, now()
        )
      `;

      return { ok: true, decision: rows[0] };
    });

    if (!result.ok) {
      apiError(res, result.status, result.code, result.message);
      return;
    }

    const decision = result.decision;
    const webhook = await deliverResolutionWebhook(db, {
      workspaceId: session.workspaceId,
      escalationId: id,
      decision: {
        id: decision.id,
        status: decision.status,
        instruction: decision.instruction,
        addedContext: decision.added_context_json,
        comment: decision.comment
      }
    }).catch((error) => {
      console.error("Developer decision webhook failed", { escalationId: id, message: error.message });
      return { sent: false, error: error.message };
    });

    json(res, 200, {
      ok: true,
      decision: {
        id: decision.id,
        escalationId: id,
        status: decision.status,
        instruction: decision.instruction,
        addedContext: decision.added_context_json,
        comment: decision.comment,
        auditId,
        createdAt: decision.created_at
      },
      webhook: { sent: Boolean(webhook.sent), reason: webhook.reason || webhook.error || null }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer decision failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
