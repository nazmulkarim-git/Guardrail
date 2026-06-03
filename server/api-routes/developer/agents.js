import { apiError, getSql, json, newId, normalizeString, publicApiError, readBody, requireDeveloper, toJson } from "../_forsig-core.js";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseReviewerEmails(value) {
  if (Array.isArray(value)) return value.map(normalizeString).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map(normalizeString)
      .filter(Boolean);
  }
  return [];
}

export default async function handler(req, res) {
  const session = requireDeveloper(req, res);
  if (!session) return;

  try {
    const db = getSql();

    if (req.method === "GET") {
      const rows = await db`
        select
          a.*,
          (select count(*)::int from escalations e where e.workspace_id = a.workspace_id and e.external_agent_id = a.slug) as escalation_count,
          (select count(*)::int from escalations e where e.workspace_id = a.workspace_id and e.external_agent_id = a.slug and e.status = 'pending') as pending_count
        from agents a
        where a.workspace_id = ${session.workspaceId}
        order by a.archived_at nulls first, a.created_at desc
      `;
      json(res, 200, { ok: true, agents: rows });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      apiError(res, 405, "method_not_allowed", "Method not allowed.");
      return;
    }

    const body = readBody(req);
    const name = normalizeString(body.name);
    if (!name) {
      apiError(res, 400, "agent_name_required", "Agent name is required.");
      return;
    }

    const slug = slugify(body.slug || name);
    if (!slug) {
      apiError(res, 400, "agent_slug_required", "Agent slug is required.");
      return;
    }

    const environment = normalizeString(body.environment) || "development";
    const allowedEnvironments = new Set(["development", "staging", "production"]);
    if (!allowedEnvironments.has(environment)) {
      apiError(res, 400, "invalid_agent_environment", "Environment must be development, staging, or production.");
      return;
    }

    const id = newId("agent");
    const reviewerEmails = parseReviewerEmails(body.defaultReviewerEmails || body.default_reviewer_emails);
    const rows = await db`
      insert into agents (
        id,
        workspace_id,
        name,
        slug,
        description,
        environment,
        default_reviewer_emails,
        created_at,
        updated_at
      )
      values (
        ${id},
        ${session.workspaceId},
        ${name},
        ${slug},
        ${normalizeString(body.description)},
        ${environment},
        ${toJson(reviewerEmails)},
        now(),
        now()
      )
      returning *
    `;

    await db`
      insert into audit_events (id, workspace_id, escalation_id, actor_type, actor_id, event_type, metadata_json, created_at)
      values (${newId("audit")}, ${session.workspaceId}, null, 'user', ${session.id}, 'agent.created', ${toJson({ agentId: id, slug })}, now())
    `;

    json(res, 201, { ok: true, agent: rows[0] });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer agents failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
