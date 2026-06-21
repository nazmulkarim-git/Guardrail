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
  const baseURL = options.baseURL ?? "https://www.forsig.com/api/v1";
  if (!options.OpenAI) {
    return { apiKey: options.apiKey, baseURL };
  }
  return new options.OpenAI({ apiKey: options.apiKey, baseURL });
}

export class Forsig {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.baseURL = (options.baseURL ?? options.baseUrl ?? "https://www.forsig.com").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error("Forsig requires fetch. Pass fetch in the constructor for this runtime.");
  }

  async escalate(input) {
    const response = await this.request("/api/v1/escalations", {
      method: "POST",
      body: JSON.stringify(input)
    });
    if (!input.waitForDecision) return response.escalation;
    return this.waitForDecision(response.escalation.id, {
      pollIntervalMs: input.pollIntervalMs,
      timeoutMs: input.timeoutMs ?? (input.timeoutSeconds ? input.timeoutSeconds * 1000 : undefined)
    });
  }

  async getEscalation(id) {
    const response = await this.request(`/api/v1/escalations/${encodeURIComponent(id)}`, {
      method: "GET"
    });
    return response.escalation;
  }

  async decide(id, decision) {
    const response = await this.request(`/api/v1/escalations/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: JSON.stringify(decision)
    });
    return response.decision;
  }

  async cancelEscalation(id) {
    const response = await this.request(`/api/v1/escalations/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: "{}"
    });
    return response.escalation;
  }

  async waitForDecision(id, options = {}) {
    const pollIntervalMs = options.pollIntervalMs ?? 1500;
    const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      const escalation = await this.getEscalation(id);
      if (escalation.status !== "pending") return escalation.decision ?? escalation;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(`Forsig escalation ${id} did not receive a decision before timeout.`);
  }

  async request(path, init) {
    const response = await this.fetchImpl(`${this.baseURL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(init.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error?.message || "Forsig request failed.");
      error.status = response.status;
      error.error = payload.error;
      throw error;
    }
    return payload;
  }
}
