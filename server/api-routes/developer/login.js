import {
  apiError,
  createDeveloperSessionCookie,
  getSql,
  hashApiKey,
  json,
  normalizeString,
  publicApiError,
  readBody
} from "../_forsig-core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    const body = readBody(req);
    const email = normalizeString(body.email)?.toLowerCase();
    const accessCode = normalizeString(body.accessCode) || normalizeString(body.access_code);
    if (!email || !accessCode) {
      apiError(res, 400, "developer_login_missing", "Email and access code are required.");
      return;
    }

    const db = getSql();
    const rows = await db`
      select d.*, w.name as workspace_name
      from developer_users d
      join workspaces w on w.id = d.workspace_id
      where d.email = ${email}
        and d.status = 'active'
      limit 1
    `;
    const developer = rows[0];
    if (!developer || developer.access_code_hash !== hashApiKey(accessCode)) {
      apiError(res, 401, "invalid_developer_login", "Invalid developer email or access code.");
      return;
    }

    await db`update developer_users set last_login_at = now(), updated_at = now() where id = ${developer.id}`;
    res.setHeader("set-cookie", createDeveloperSessionCookie(developer));
    json(res, 200, {
      ok: true,
      developer: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
        company: developer.company,
        workspaceId: developer.workspace_id,
        workspaceName: developer.workspace_name
      }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer login failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
