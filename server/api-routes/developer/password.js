import {
  apiError,
  getSql,
  hashPassword,
  json,
  normalizeString,
  publicApiError,
  readBody,
  requireDeveloper
} from "../_forsig-core.js";

export default async function handler(req, res) {
  const session = requireDeveloper(req, res);
  if (!session) return;
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    const body = readBody(req);
    const password = normalizeString(body.password);
    const confirmPassword = normalizeString(body.confirmPassword) || normalizeString(body.confirm_password);
    if (!password || password.length < 10) {
      apiError(res, 400, "password_too_short", "Password must be at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      apiError(res, 400, "password_mismatch", "Passwords do not match.");
      return;
    }

    const db = getSql();
    await db`
      update developer_users
      set password_hash = ${hashPassword(password)},
          password_set_at = now(),
          must_reset_password = false,
          updated_at = now()
      where id = ${session.id}
        and workspace_id = ${session.workspaceId}
        and status = 'active'
    `;

    json(res, 200, { ok: true });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer password update failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
