import { createAdminSessionCookie, json, readBody, requireMethod } from "../_forsig-core.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const body = readBody(req);
  const password = typeof body.password === "string" ? body.password : "";
  const expected = process.env.FORSIG_ADMIN_PASSWORD;

  if (!expected) {
    json(res, 503, { ok: false, error: { code: "admin_password_missing", message: "FORSIG_ADMIN_PASSWORD is not configured." } });
    return;
  }

  if (password !== expected) {
    json(res, 401, { ok: false, error: { code: "invalid_admin_password", message: "Invalid password." } });
    return;
  }

  res.setHeader("Set-Cookie", createAdminSessionCookie());
  json(res, 200, { ok: true, user: { role: "admin" } });
}

