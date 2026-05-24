export function newForsigSession(prefix = "sess") {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random.replaceAll("-", "")}`;
}

export function forsigHeaders(input = {}) {
  const headers = {};
  if (input.agentId) headers["x-forsig-agent-id"] = input.agentId;
  if (input.agentInstanceId) headers["x-forsig-agent-instance-id"] = input.agentInstanceId;
  if (input.sessionId) headers["x-forsig-session-id"] = input.sessionId;
  if (input.externalUserId) headers["x-forsig-external-user-id"] = input.externalUserId;
  if (input.requestId) headers["x-forsig-request-id"] = input.requestId;
  if (input.metadata) {
    for (const [key, value] of Object.entries(input.metadata)) {
      if (value !== undefined && value !== null) headers[`x-forsig-meta-${key}`] = String(value);
    }
  }
  return headers;
}

export function parseForsigError(error) {
  const status = error?.status ?? error?.response?.status;
  const payload = error?.error ?? error?.response?.data?.error ?? error?.body?.error;
  if (!payload || typeof payload !== "object") return { isForsigError: false, status };
  const type = payload.type;
  const code = payload.code;
  return {
    isForsigError: typeof type === "string" && type.startsWith("forsig_"),
    status,
    type,
    code,
    message: payload.message
  };
}

export function createForsigOpenAIClient(options) {
  const baseURL = options.baseURL ?? "https://api.forsig.com/v1";
  if (!options.OpenAI) {
    return { apiKey: options.apiKey, baseURL };
  }
  return new options.OpenAI({ apiKey: options.apiKey, baseURL });
}
