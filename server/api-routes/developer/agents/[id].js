import { apiError, getSql, json, newId, normalizeString, publicApiError, readBody, requireDeveloper, toJson } from "../../_forsig-core.js";

function parseReviewerEmails(value) {
  if (Array.isArray(value)) return value.map(normalizeString).filter(Boolean);
  if (typeof value === "string") return value.split(/[,\n]/).map(normalizeString).filter(Boolean);
  return [];
}

export default async function handler(req, res) {
  const session = requireDeveloper(req, res);
  if (!session) return;

  try {
    const db = getSql();
    const id = req.query?.id;

    if (req.method === "GET") {
      const rows = await db`
        select *
        from agents
        where id = ${id}
          and workspace_id = ${session.workspaceId}
        limit 1
      `;
      if (!rows[0]) {
        apiError(res, 404, "agent_not_found", "Agent not found.");
        return;
      }
      json(res, 200, { ok: true, agent: rows[0] });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      apiError(res, 405, "method_not_allowed", "Method not allowed.");
      return;
    }

    const body = readBody(req);
    const name = normalizeString(body.name);
    const environment = normalizeString(body.environment);
    const allowedEnvironments = new Set(["development", "staging", "production"]);
    if (environment && !allowedEnvironments.has(environment)) {
      apiError(res, 400, "invalid_agent_environment", "Environment must be development, staging, or production.");
      return;
    }

    const archive = Boolean(body.archive || body.archived);
    const reviewerEmails = parseReviewerEmails(body.defaultReviewerEmails || body.default_reviewer_emails);
    const hasReviewerEmails = body.defaultReviewerEmails !== undefined || body.default_reviewer_emails !== undefined;
    const rows = await db`
      update agents
      set
        name = coalesce(${name}, name),
        description = coalesce(${body.description === undefined ? null : normalizeString(body.description)}, description),
        environment = coalesce(${environment}, environment),
        default_reviewer_emails = case when ${hasReviewerEmails}::boolean then ${toJson(reviewerEmails)} else default_reviewer_emails end,
        archived_at = case when ${archive}::boolean then now() else archived_at end,
        updated_at = now()
      where id = ${id}
        and workspace_id = ${session.workspaceId}
      returning *
    `;

    if (!rows[0]) {
      apiError(res, 404, "agent_not_found", "Agent not found.");
      return;
    }

    await db`
      insert into audit_events (id, workspace_id, escalation_id, actor_type, actor_id, event_type, metadata_json, created_at)
      values (${newId("audit")}, ${session.workspaceId}, null, 'user', ${session.id}, ${archive ? 'agent.archived' : 'agent.updated'}, ${toJson({ agentId: id })}, now())
    `;

    json(res, 200, { ok: true, agent: rows[0] });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer agent detail failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
