import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const routeRoot = path.join(root, "server", "api-routes");

const routes = [
  { method: "GET", pattern: /^config$/, file: "config.js" },
  { method: "POST", pattern: /^contact$/, file: "contact.js" },
  { method: "GET", pattern: /^referral-accept$/, file: "referral-accept.js" },
  { method: "POST", pattern: /^referral-invite$/, file: "referral-invite.js" },
  { method: "GET", pattern: /^waitlist-health$/, file: "waitlist-health.js" },
  { method: "POST", pattern: /^waitlist-profile$/, file: "waitlist-profile.js" },
  { method: "POST", pattern: /^waitlist$/, file: "waitlist.js" },

  { method: "POST", pattern: /^v1\/escalations$/, file: "v1/escalations.js" },
  { method: "GET", pattern: /^v1\/escalations\/([^/]+)$/, file: "v1/escalations/[id].js", params: ["id"] },
  { method: "POST", pattern: /^v1\/escalations\/([^/]+)\/decision$/, file: "v1/escalations/[id]/decision.js", params: ["id"] },

  { method: "POST", pattern: /^admin\/login$/, file: "admin/login.js" },
  { method: "POST", pattern: /^admin\/logout$/, file: "admin/logout.js" },
  { method: "GET", pattern: /^admin\/me$/, file: "admin/me.js" },
  { method: "GET", pattern: /^admin\/workspace$/, file: "admin/workspace.js" },
  { method: "POST", pattern: /^admin\/workspace$/, file: "admin/workspace.js" },
  { method: "GET", pattern: /^admin\/api-key$/, file: "admin/api-key.js" },
  { method: "POST", pattern: /^admin\/api-key$/, file: "admin/api-key.js" },
  { method: "GET", pattern: /^admin\/escalations$/, file: "admin/escalations.js" },
  { method: "GET", pattern: /^admin\/escalations\/([^/]+)$/, file: "admin/escalations/[id].js", params: ["id"] },
  { method: "POST", pattern: /^admin\/escalations\/([^/]+)\/decision$/, file: "admin/escalations/[id]/decision.js", params: ["id"] }
];

function routePath(req) {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.join("/");
  if (typeof raw === "string") return raw;
  return "";
}

export default async function handler(req, res) {
  const requestedPath = routePath(req);
  const route = routes.find((candidate) => candidate.method === req.method && candidate.pattern.test(requestedPath));

  if (!route) {
    res.status(404).json({
      ok: false,
      error: {
        type: "forsig_api_error",
        code: "route_not_found",
        message: "API route not found."
      }
    });
    return;
  }

  const match = requestedPath.match(route.pattern);
  req.query = {
    ...req.query,
    ...(route.params || []).reduce((acc, name, index) => {
      acc[name] = match[index + 1];
      return acc;
    }, {})
  };

  const modulePath = path.join(routeRoot, route.file);
  const mod = await import(pathToFileURL(modulePath).href);
  await mod.default(req, res);
}
