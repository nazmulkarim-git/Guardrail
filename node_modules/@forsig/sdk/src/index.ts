export type ForsigHeadersInput = {
  agentId?: string;
  agentInstanceId?: string;
  sessionId?: string;
  externalUserId?: string;
  requestId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type ForsigBlockCode =
  | "approval_required"
  | "approval_rejected"
  | "approval_expired"
  | "reviewer_unavailable"
  | "risk_route_not_found"
  | "rate_limited"
  | "safety_policy_block";

export type ForsigParsedError = {
  isForsigError: boolean;
  status?: number;
  type?: string;
  code?: ForsigBlockCode | string;
  message?: string;
};

export type ForsigRisk =
  | string
  | {
      type: string;
      level?: "low" | "medium" | "high" | "critical" | string;
      reason?: string;
    };

export type ForsigEscalationInput = {
  agent: string | { id?: string; name?: string; version?: string; environment?: string };
  runId?: string;
  workflow?: string;
  step?: string;
  task: string | { title: string; description?: string; customerImpact?: boolean };
  risk: ForsigRisk;
  proposedAction: string;
  context?: Record<string, unknown>;
  trace?: Record<string, unknown>;
  model?: Record<string, unknown>;
  notify?: string[];
  allowedActions?: string[];
  callbackUrl?: string;
  timeoutSeconds?: number;
  waitForDecision?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export type ForsigDecisionInput = {
  status: "approved" | "rejected" | "edited" | "context_added" | "taken_over" | "needs_more_info" | "expired" | "canceled";
  instruction?: string;
  addedContext?: Record<string, unknown>;
  comment?: string;
  reviewer?: {
    id?: string;
    name?: string;
    channel?: string;
  };
};

export type ForsigClientOptions = {
  apiKey: string;
  baseURL?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export function newForsigSession(prefix = "sess"): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random.replaceAll("-", "")}`;
}

export function forsigHeaders(input: ForsigHeadersInput = {}): Record<string, string> {
  const headers: Record<string, string> = {};
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

export function parseForsigError(error: unknown): ForsigParsedError {
  const anyError = error as any;
  const status = anyError?.status ?? anyError?.response?.status;
  const payload = anyError?.error ?? anyError?.response?.data?.error ?? anyError?.body?.error;
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

export function createForsigOpenAIClient(options: {
  apiKey: string;
  baseURL?: string;
  OpenAI?: new (config: { apiKey: string; baseURL: string }) => unknown;
}) {
  const baseURL = options.baseURL ?? "https://api.forsig.com/v1";
  if (!options.OpenAI) {
    return { apiKey: options.apiKey, baseURL };
  }
  return new options.OpenAI({ apiKey: options.apiKey, baseURL });
}

export class Forsig {
  private apiKey: string;
  private baseURL: string;
  private fetchImpl: typeof fetch;

  constructor(options: ForsigClientOptions) {
    this.apiKey = options.apiKey;
    this.baseURL = (options.baseURL ?? options.baseUrl ?? "https://api.forsig.com").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error("Forsig requires fetch. Pass fetch in the constructor for this runtime.");
  }

  async escalate(input: ForsigEscalationInput) {
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

  async getEscalation(id: string) {
    const response = await this.request(`/api/v1/escalations/${encodeURIComponent(id)}`, {
      method: "GET"
    });
    return response.escalation;
  }

  async decide(id: string, decision: ForsigDecisionInput) {
    const response = await this.request(`/api/v1/escalations/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: JSON.stringify(decision)
    });
    return response.decision;
  }

  async cancelEscalation(id: string) {
    const response = await this.request(`/api/v1/escalations/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: "{}"
    });
    return response.escalation;
  }

  async waitForDecision(id: string, options: { pollIntervalMs?: number; timeoutMs?: number } = {}) {
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

  private async request(path: string, init: RequestInit) {
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
      const error = new Error(payload.error?.message || "Forsig request failed.") as Error & { status?: number; error?: unknown };
      error.status = response.status;
      error.error = payload.error;
      throw error;
    }
    return payload;
  }
}
