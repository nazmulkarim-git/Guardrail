import {
  apiError,
  checkRateLimit,
  generateTemporaryPassword,
  getSql,
  hashPassword,
  json,
  normalizeString,
  publicApiError,
  readBody,
  sendEmail
} from "../_forsig-core.js";

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    if (!checkRateLimit(req, res, "developer_forgot_password", { limit: 5, windowMs: 10 * 60_000 })) return;
    const body = readBody(req);
    const email = normalizeString(body.email)?.toLowerCase();
    if (!isEmail(email)) {
      apiError(res, 400, "invalid_email", "Enter the email that has Forsig beta access.");
      return;
    }

    const db = getSql();
    const rows = await db`
      select id, email, name, password_hash
      from developer_users
      where email = ${email}
        and status = 'active'
      limit 1
    `;
    const developer = rows[0];
    if (!developer?.password_hash) {
      json(res, 200, { ok: true, sent: false });
      return;
    }

    const temporaryPassword = generateTemporaryPassword();
    await db`
      update developer_users
      set password_hash = ${hashPassword(temporaryPassword)},
          must_reset_password = true,
          updated_at = now()
      where id = ${developer.id}
    `;

    const result = await sendEmail({
      to: developer.email,
      subject: "Your temporary Forsig password",
      html: `
        <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
          <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
            <p style="margin:0 0 12px;color:#00ffc2;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig beta access</p>
            <h1 style="margin:0 0 16px;font-size:28px;line-height:1.1">Temporary password</h1>
            <p style="color:#c9cedd;line-height:1.65">Use this temporary password to log in, then create a new password inside Forsig.</p>
            <p style="font-size:20px;font-weight:800;color:#d7ff72;letter-spacing:.04em">${temporaryPassword}</p>
            <p style="color:#8f96aa">If you did not request this, reply to this email.</p>
          </div>
        </div>
      `
    });

    json(res, 200, { ok: true, sent: Boolean(result.sent) });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer forgot password failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
