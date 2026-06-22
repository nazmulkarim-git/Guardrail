import { apiError, generateApiKey, getSql, hashApiKey, json, newId, normalizeString, publicApiError, readBody, requireDeveloper } from "../_forsig-core.js";

export default async function handler(req, res) {
  const session = requireDeveloper(req, res);
  if (!session) return;

  try {
    const db = getSql();

    if (req.method === "GET") {
      const keys = await db`
        select id, name, prefix, last_used_at, created_at, revoked_at, held_at
        from api_keys
        where workspace_id = ${session.workspaceId}
        order by created_at desc
      `;
      json(res, 200, { ok: true, keys });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      apiError(res, 405, "method_not_allowed", "Method not allowed.");
      return;
    }

    const body = readBody(req);
    const name = normalizeString(body.name) || "Developer beta key";
    const key = generateApiKey("fsk_test");
    const prefix = key.split("_").slice(0, 3).join("_");
    const id = newId("key");

    await db`
      insert into api_keys (id, workspace_id, name, hashed_key, prefix, created_at)
      values (${id}, ${session.workspaceId}, ${name}, ${hashApiKey(key)}, ${prefix}, now())
    `;

    json(res, 201, {
      ok: true,
      apiKey: {
        id,
        name,
        key,
        prefix,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer API key failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
