import {
  DECISION_STATUSES,
  apiError,
  authenticateRequest,
  deliverResolutionWebhook,
  getSql,
  json,
  newId,
  normalizeString,
  publicApiError,
  readBody,
  requireMethod,
  toJson
} from "../../../_forsig-core.js";

export function validateDecisionPayload(body) {
  const status = normalizeString(body.status);
  const instruction = normalizeString(body.instruction);
  const errors = [];
  if (!status || !DECISION_STATUSES.has(status)) {
    errors.push("status must be one of approved, rejected, edited, context_added, taken_over, needs_more_info, expired, or canceled.");
  }
  if (status !== "approved" && !instruction) {
    errors.push("instruction is required unless status is approved.");
  }
  return {
    valid: errors.length === 0,
    errors,
    status,
    instruction: instruction || "Proceed with the proposed action.",
    addedContext: body.addedContext ?? body.added_context ?? null,
    comment: normalizeString(body.comment),
    reviewer: body.reviewer && typeof body.reviewer === "object" ? body.reviewer : {}
  };
}

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
    const body = readBody(req);
    const parsed = validateDecisionPayload(body);
    if (!parsed.valid) {
      apiError(res, 400, "invalid_decision", parsed.errors.join(" "));
      return;
    }

    const escalationRows = await db`
      select id, status, workspace_id
      from escalations
      where id = ${id}
        and workspace_id = ${auth.workspaceId}
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
    const reviewerName = normalizeString(parsed.reviewer.name);
    const reviewerChannel = normalizeString(parsed.reviewer.channel) || "dashboard";
    const reviewerUserId = normalizeString(parsed.reviewer.id);

    const decisionRows = await db`
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
        ${auth.workspaceId},
        ${reviewerUserId},
        ${reviewerName},
        ${reviewerChannel},
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
        and workspace_id = ${auth.workspaceId}
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
        ${auth.workspaceId},
        ${id},
        'user',
        ${reviewerUserId || reviewerName || 'reviewer'},
        ${`decision.${parsed.status}`},
        ${toJson({ instruction: parsed.instruction, reviewerChannel })},
        now()
      )
    `;

    const decision = decisionRows[0];
    const webhook = await deliverResolutionWebhook(db, {
      workspaceId: auth.workspaceId,
      escalationId: id,
      decision: {
        id: decision.id,
        status: decision.status,
        instruction: decision.instruction,
        addedContext: decision.added_context_json,
        comment: decision.comment
      }
    }).catch((error) => {
      console.error("API decision webhook failed", { escalationId: id, message: error.message });
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
        reviewer: {
          id: decision.reviewer_user_id,
          name: decision.reviewer_name,
          channel: decision.reviewer_channel
        },
        auditId,
        createdAt: decision.created_at
      },
      webhook: { sent: Boolean(webhook.sent), reason: webhook.reason || webhook.error || null }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Create decision failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
