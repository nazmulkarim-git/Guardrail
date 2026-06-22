import { apiError, getSql, json, normalizeString, publicApiError, readBody, requireAdmin, toJson } from "../_forsig-core.js";

const DEFAULT_WORKSPACE_ID = "workspace_beta";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const db = getSql();
    const workspaceId = process.env.FORSIG_DEFAULT_WORKSPACE_ID || DEFAULT_WORKSPACE_ID;

    if (req.method === "POST") {
      const body = readBody(req);
      const name = normalizeString(body.name) || "Forsig Private Beta";
      const ownerEmail = normalizeString(body.ownerEmail) || normalizeString(body.owner_email);
      await db`
        insert into workspaces (id, name, owner_email, updated_at)
        values (${workspaceId}, ${name}, ${ownerEmail}, now())
        on conflict (id) do update set
          name = excluded.name,
          owner_email = excluded.owner_email,
          updated_at = now()
      `;
    } else if (req.method !== "GET") {
      res.setHeader("allow", "GET, POST");
      apiError(res, 405, "method_not_allowed", "Method not allowed.");
      return;
    }

    const rows = await db`
      select
        w.*,
        (select count(*)::int from escalations where workspace_id = w.id and status = 'pending') as pending_count,
        (select count(*)::int from escalations where workspace_id = w.id) as escalation_count,
        (select count(*)::int from api_keys where workspace_id = w.id and revoked_at is null and held_at is null) as active_key_count
      from workspaces w
      where w.id = ${workspaceId}
      limit 1
    `;

    const workspaces = await db`
      select
        w.*,
        (select count(*)::int from developer_users where workspace_id = w.id) as developer_count,
        (select count(*)::int from agents where workspace_id = w.id and archived_at is null) as agent_count,
        (select count(*)::int from api_keys where workspace_id = w.id and revoked_at is null and held_at is null) as active_key_count,
        (select count(*)::int from escalations where workspace_id = w.id) as escalation_count,
        (select count(*)::int from escalations where workspace_id = w.id and status = 'pending') as pending_count
      from workspaces w
      order by w.created_at desc nulls last, w.updated_at desc nulls last
      limit 250
    `;

    json(res, 200, { ok: true, workspace: rows[0] || null, workspaces, defaults: toJson({ workspaceId }) });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Admin workspace failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
