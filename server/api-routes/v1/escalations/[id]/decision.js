import { apiError, requireMethod } from "../../../_forsig-core.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  apiError(
    res,
    403,
    "reviewer_auth_required",
    "Agent API credentials cannot grant reviewer decisions. Use an authenticated reviewer or admin session."
  );
}
