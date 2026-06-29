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
  mode?: "shadow" | "active";
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
  review?: {
    notify?: string[];
    reviewerEmail?: string;
    reviewerEmails?: string[];
    timeoutSeconds?: number;
    testMode?: "manual" | "auto_approve" | "auto_reject" | "auto_timeout" | string;
    mode?: "shadow" | "active";
    allowedActions?: string[];
  };
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

export function newForsigSession(prefix?: string): string;
export function forsigHeaders(input?: ForsigHeadersInput): Record<string, string>;
export function parseForsigError(error: unknown): ForsigParsedError;
export function createForsigOpenAIClient(options: {
  apiKey: string;
  baseURL?: string;
  OpenAI?: new (config: { apiKey: string; baseURL: string }) => unknown;
}): unknown;

export class Forsig {
  constructor(options: ForsigClientOptions);
  escalate(input: ForsigEscalationInput): Promise<any>;
  getEscalation(id: string): Promise<any>;
  decide(id: string, decision: ForsigDecisionInput): Promise<any>;
  cancelEscalation(id: string): Promise<any>;
  waitForDecision(id: string, options?: { pollIntervalMs?: number; timeoutMs?: number }): Promise<any>;
}
