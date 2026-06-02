import {
  DECISION_STATUSES,
  apiError,
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
    const body = readBody(req);
    const parsed = validateDecisionPayload(body);
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

    const escalationRows = await db`
      select id, status
      from escalations
      where id = ${id}
        and workspace_id = ${session.workspaceId}
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
    const reviewerName = developer.name || developer.email;
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
        ${session.workspaceId},
        ${developer.id},
        ${reviewerName},
        'developer_portal',
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
        and workspace_id = ${session.workspaceId}
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
        ${session.workspaceId},
        ${id},
        'user',
        ${developer.id},
        ${`decision.${parsed.status}`},
        ${toJson({ instruction: parsed.instruction, reviewerName })},
        now()
      )
    `;

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
      }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer decision failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
