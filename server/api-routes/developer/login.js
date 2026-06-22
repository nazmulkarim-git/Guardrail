import {
  apiError,
  checkRateLimit,
  createDeveloperSessionCookie,
  getSql,
  hashApiKey,
  hashPassword,
  json,
  normalizeString,
  publicApiError,
  readBody,
  verifyPassword
} from "../_forsig-core.js";

function validateStrongPassword(password) {
  if (!password || password.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include at least one special character.";
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    if (!checkRateLimit(req, res, "developer_login", { limit: 12, windowMs: 10 * 60_000 })) return;
    const body = readBody(req);
    const email = normalizeString(body.email)?.toLowerCase();
    const accessCode = normalizeString(body.accessCode) || normalizeString(body.access_code);
    const password = normalizeString(body.password);
    const confirmPassword = normalizeString(body.confirmPassword) || normalizeString(body.confirm_password);
    if (!email || (!accessCode && !password)) {
      apiError(res, 400, "developer_login_missing", "Email and password or access code are required.");
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
    if (!developer) {
      apiError(res, 401, "invalid_developer_login", "Invalid developer login.");
      return;
    }

    if (password && developer.password_hash) {
      if (!verifyPassword(password, developer.password_hash)) {
        apiError(res, 401, "invalid_developer_login", "Invalid developer login.");
        return;
      }
      await db`update developer_users set last_login_at = now(), updated_at = now() where id = ${developer.id}`;
    } else if (accessCode) {
      if (developer.access_code_hash !== hashApiKey(accessCode)) {
        apiError(res, 401, "invalid_developer_login", "Invalid developer email or access code.");
        return;
      }
      if (developer.password_hash) {
        apiError(res, 400, "password_already_set", "This developer already signed up. Use Sign in with email and password.");
        return;
      }
      if (!password && !developer.password_hash) {
        await db`
          update developer_users
          set access_code_used_at = coalesce(access_code_used_at, now()),
              must_reset_password = true,
              last_login_at = now(),
              updated_at = now()
          where id = ${developer.id}
        `;
        res.setHeader("set-cookie", createDeveloperSessionCookie(developer));
        json(res, 200, {
          ok: true,
          mustResetPassword: true,
          setupRequired: true,
          message: "Create a password to finish opening your beta workspace.",
          developer: {
            id: developer.id,
            email: developer.email,
            name: developer.name,
            company: developer.company,
            workspaceId: developer.workspace_id,
            workspaceName: developer.workspace_name,
            mustResetPassword: true
          }
        });
        return;
      }
      if (password) {
        const passwordError = validateStrongPassword(password);
        if (passwordError) {
          apiError(res, 400, "weak_password", passwordError);
          return;
        }
        if (password !== confirmPassword) {
          apiError(res, 400, "password_mismatch", "Passwords do not match.");
          return;
        }
        await db`
          update developer_users
          set password_hash = ${hashPassword(password)},
              password_set_at = now(),
              access_code_used_at = now(),
              last_login_at = now(),
              updated_at = now()
          where id = ${developer.id}
        `;
      }
    } else {
      apiError(res, 401, "invalid_developer_login", "Invalid developer login.");
      return;
    }

    res.setHeader("set-cookie", createDeveloperSessionCookie(developer));
    json(res, 200, {
      ok: true,
      mustResetPassword: Boolean(developer.must_reset_password),
      developer: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
        company: developer.company,
        workspaceId: developer.workspace_id,
        workspaceName: developer.workspace_name,
        mustResetPassword: Boolean(developer.must_reset_password)
      }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer login failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
