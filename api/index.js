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
  { method: "POST", pattern: /^v1\/escalations\/([^/]+)\/cancel$/, file: "v1/escalations/[id]/cancel.js", params: ["id"] },

  { method: "POST", pattern: /^admin\/login$/, file: "admin/login.js" },
  { method: "POST", pattern: /^admin\/logout$/, file: "admin/logout.js" },
  { method: "GET", pattern: /^admin\/me$/, file: "admin/me.js" },
  { method: "GET", pattern: /^admin\/workspace$/, file: "admin/workspace.js" },
  { method: "POST", pattern: /^admin\/workspace$/, file: "admin/workspace.js" },
  { method: "GET", pattern: /^admin\/waitlist$/, file: "admin/waitlist.js" },
  { method: "POST", pattern: /^admin\/waitlist$/, file: "admin/waitlist.js" },
  { method: "GET", pattern: /^admin\/api-key$/, file: "admin/api-key.js" },
  { method: "POST", pattern: /^admin\/api-key$/, file: "admin/api-key.js" },
  { method: "GET", pattern: /^admin\/developers$/, file: "admin/developers.js" },
  { method: "POST", pattern: /^admin\/developers$/, file: "admin/developers.js" },
  { method: "GET", pattern: /^admin\/audit$/, file: "admin/audit.js" },
  { method: "GET", pattern: /^admin\/escalations$/, file: "admin/escalations.js" },
  { method: "GET", pattern: /^admin\/escalations\/([^/]+)$/, file: "admin/escalations/[id].js", params: ["id"] },
  { method: "POST", pattern: /^admin\/escalations\/([^/]+)\/decision$/, file: "admin/escalations/[id]/decision.js", params: ["id"] },

  { method: "POST", pattern: /^developer\/login$/, file: "developer/login.js" },
  { method: "POST", pattern: /^developer\/forgot-password$/, file: "developer/forgot-password.js" },
  { method: "POST", pattern: /^developer\/password$/, file: "developer/password.js" },
  { method: "POST", pattern: /^developer\/logout$/, file: "developer/logout.js" },
  { method: "GET", pattern: /^developer\/me$/, file: "developer/me.js" },
  { method: "GET", pattern: /^developer\/workspace$/, file: "developer/workspace.js" },
  { method: "POST", pattern: /^developer\/workspace$/, file: "developer/workspace.js" },
  { method: "GET", pattern: /^developer\/profile$/, file: "developer/profile.js" },
  { method: "POST", pattern: /^developer\/profile$/, file: "developer/profile.js" },
  { method: "GET", pattern: /^developer\/audit$/, file: "developer/audit.js" },
  { method: "GET", pattern: /^developer\/agents$/, file: "developer/agents.js" },
  { method: "POST", pattern: /^developer\/agents$/, file: "developer/agents.js" },
  { method: "GET", pattern: /^developer\/agents\/([^/]+)$/, file: "developer/agents/[id].js", params: ["id"] },
  { method: "POST", pattern: /^developer\/agents\/([^/]+)$/, file: "developer/agents/[id].js", params: ["id"] },
  { method: "GET", pattern: /^developer\/api-key$/, file: "developer/api-key.js" },
  { method: "POST", pattern: /^developer\/api-key$/, file: "developer/api-key.js" },
  { method: "POST", pattern: /^developer\/api-key\/([^/]+)\/hold$/, file: "developer/api-key/[id]/hold.js", params: ["id"] },
  { method: "POST", pattern: /^developer\/api-key\/([^/]+)\/revoke$/, file: "developer/api-key/[id]/revoke.js", params: ["id"] },
  { method: "POST", pattern: /^developer\/test-escalation$/, file: "developer/test-escalation.js" },
  { method: "GET", pattern: /^developer\/escalations$/, file: "developer/escalations.js" },
  { method: "GET", pattern: /^developer\/escalations\/([^/]+)$/, file: "developer/escalations/[id].js", params: ["id"] },
  { method: "POST", pattern: /^developer\/escalations\/([^/]+)\/decision$/, file: "developer/escalations/[id]/decision.js", params: ["id"] }
];

function routePath(req) {
  const queryPath = req.query?.path;
  if (Array.isArray(queryPath)) return queryPath.join("/");
  if (typeof queryPath === "string" && queryPath) return queryPath.replace(/^\/+/, "");

  const url = new URL(req.url || "/api", `https://${req.headers.host || "www.forsig.com"}`);
  return url.pathname.replace(/^\/api\/?/, "").replace(/^\/+/, "");
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
        message: `API route not found: ${requestedPath || "/"}`
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
