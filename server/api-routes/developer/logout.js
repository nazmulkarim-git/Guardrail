import { clearDeveloperSessionCookie, json } from "../_forsig-core.js";

export default async function handler(_req, res) {
  res.setHeader("set-cookie", clearDeveloperSessionCookie());
  json(res, 200, { ok: true });
}
