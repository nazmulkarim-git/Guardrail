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
  requireAdmin,
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
    comment: normalizeString(body.comment),
    reviewerName: normalizeString(body.reviewerName) || "Admin reviewer",
    reviewerChannel: normalizeString(body.reviewerChannel) || "dashboard"
  };
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    const db = getSql();
    const workspaceId = process.env.FORSIG_DEFAULT_WORKSPACE_ID || "workspace_beta";
    const id = req.query?.id;
    const body = readBody(req);
    const parsed = validateDecisionPayload(body);
    if (!parsed.valid) {
      apiError(res, 400, "invalid_decision", parsed.errors.join(" "));
      return;
    }

    const escalationRows = await db`
      select id, status
      from escalations
      where id = ${id}
        and workspace_id = ${workspaceId}
      limit 1
    `;
    const escalation = escalationRows[0];
    if (!escalation) {
      apiError(res, 404, "escalation_not_found", "Escalation not found.");
      return;
    }
    if (escalation.status !== "pending") {
      apiError(res, 409, "escalation_already_resolved", "This escalation is already resolved.");
      return;
    }

    const decisionId = newId("dec");
    const auditId = newId("audit");
    const rows = await db`
      insert into decisions (
        id,
        escalation_id,
        workspace_id,
        reviewer_user_id,
        reviewer_name,
        reviewer_channel,
        status,
        instruction,
        added_context_json,
        comment,
        created_at
      )
      values (
        ${decisionId},
        ${id},
        ${workspaceId},
        'admin',
        ${parsed.reviewerName},
        ${parsed.reviewerChannel},
        ${parsed.status},
        ${parsed.instruction},
        ${toJson(parsed.addedContext)},
        ${parsed.comment},
        now()
      )
      returning *
    `;

    await db`
      update escalations
      set status = ${parsed.status},
          resolved_at = now(),
          updated_at = now()
      where id = ${id}
        and workspace_id = ${workspaceId}
    `;

    await db`
      insert into audit_events (
        id,
        workspace_id,
        escalation_id,
        actor_type,
        actor_id,
        event_type,
        metadata_json,
        created_at
      )
      values (
        ${auditId},
        ${workspaceId},
        ${id},
        'user',
        'admin',
        ${`decision.${parsed.status}`},
        ${toJson({ instruction: parsed.instruction, reviewerName: parsed.reviewerName })},
        now()
      )
    `;

    const webhook = await deliverResolutionWebhook(db, {
      workspaceId,
      escalationId: id,
      decision: {
        id: rows[0].id,
        status: rows[0].status,
        instruction: rows[0].instruction,
        addedContext: rows[0].added_context_json,
        comment: rows[0].comment
      }
    }).catch((error) => {
      console.error("Admin decision webhook failed", { escalationId: id, message: error.message });
      return { sent: false, error: error.message };
    });

    json(res, 200, {
      ok: true,
      decision: {
        id: rows[0].id,
        escalationId: id,
        status: rows[0].status,
        instruction: rows[0].instruction,
        addedContext: rows[0].added_context_json,
        comment: rows[0].comment,
        auditId,
        createdAt: rows[0].created_at
      },
      webhook: { sent: Boolean(webhook.sent), reason: webhook.reason || webhook.error || null }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Admin decision failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
