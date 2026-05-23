export type ForsigHeadersInput = {
  agentId?: string;
  agentInstanceId?: string;
  sessionId?: string;
  externalUserId?: string;
  requestId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type ForsigBlockCode =
  | "invalid_virtual_key"
  | "daily_budget_exceeded"
  | "monthly_budget_exceeded"
  | "per_request_budget_exceeded"
  | "model_not_allowed"
  | "model_blocked"
  | "agent_paused"
  | "organization_paused"
  | "instance_paused"
  | "loop_detected"
  | "rate_limited"
  | "safety_policy_block";

export type ForsigParsedError = {
  isForsigError: boolean;
  status?: number;
  type?: string;
  code?: ForsigBlockCode | string;
  message?: string;
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
  const baseURL = options.baseURL ?? "https://gateway.forsig.com/v1";
  if (!options.OpenAI) {
    return { apiKey: options.apiKey, baseURL };
  }
  return new options.OpenAI({ apiKey: options.apiKey, baseURL });
}
