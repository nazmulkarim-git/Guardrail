import { isAdminAuthenticated, json, requireMethod } from "../_forsig-core.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  json(res, 200, {
    ok: true,
    authenticated: isAdminAuthenticated(req),
    user: isAdminAuthenticated(req) ? { role: "admin" } : null
  });
}

