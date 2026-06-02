import { clearAdminSessionCookie, json, requireMethod } from "../_forsig-core.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  res.setHeader("Set-Cookie", clearAdminSessionCookie());
  json(res, 200, { ok: true });
}

