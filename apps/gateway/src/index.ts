type ForsigError = {
  error: {
    type: string;
    code: string;
    message: string;
  };
};

type GatewayContext = {
  virtualKey: {
    id: string;
    orgId: string;
    agentId: string;
    status: "active" | "revoked";
  };
  agent: {
    id: string;
    providerKeyId: string;
    pauseState: "active" | "paused";
    allowedModels: string[];
    blockedModels: string[];
    dailyBudgetUsdCents: number;
    monthlyBudgetUsdCents: number;
    perRequestBudgetUsdCents: number;
    requiredInstructions?: string | null;
    instructionMode: "audit_only";
  };
  spend: {
    dailyUsdCents: number;
    monthlyUsdCents: number;
  };
};

export function forsigError(status: number, code: string, message: string): Response {
  const body: ForsigError = {
    error: {
      type: status === 401 ? "forsig_auth_error" : "forsig_policy_error",
      code,
      message
    }
  };
  return Response.json(body, { status });
}

export function estimateTokensFromMessages(messages: Array<{ content: unknown }>): number {
  const text = messages
    .map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content)))
    .join("\n");
  return Math.max(1, Math.ceil(text.length / 4));
}

export function evaluatePolicy(context: GatewayContext, request: { model: string; messages: Array<{ content: unknown }>; max_tokens?: number }) {
  if (context.virtualKey.status !== "active") return { allowed: false, status: 401, code: "invalid_virtual_key", message: "Invalid or revoked Forsig virtual key." };
  if (context.agent.pauseState === "paused") return { allowed: false, status: 423, code: "agent_paused", message: "This Forsig agent is paused." };
  if (context.agent.blockedModels.includes(request.model)) return { allowed: false, status: 403, code: "model_blocked", message: "This model is blocked for the agent." };
  if (context.agent.allowedModels.length > 0 && !context.agent.allowedModels.includes(request.model)) {
    return { allowed: false, status: 403, code: "model_not_allowed", message: "This model is not allowed for the agent." };
  }

  const estimatedInputTokens = estimateTokensFromMessages(request.messages);
  const estimatedOutputTokens = request.max_tokens ?? 512;
  const estimatedCostUsdCents = Math.ceil(((estimatedInputTokens + estimatedOutputTokens) / 1000) * 1);

  if (estimatedCostUsdCents > context.agent.perRequestBudgetUsdCents) {
    return { allowed: false, status: 402, code: "per_request_budget_exceeded", message: "This request would exceed the per-request budget.", estimatedInputTokens, estimatedOutputTokens, estimatedCostUsdCents };
  }
  if (context.spend.dailyUsdCents + estimatedCostUsdCents > context.agent.dailyBudgetUsdCents) {
    return { allowed: false, status: 402, code: "daily_budget_exceeded", message: "This request would exceed the daily budget.", estimatedInputTokens, estimatedOutputTokens, estimatedCostUsdCents };
  }
  if (context.spend.monthlyUsdCents + estimatedCostUsdCents > context.agent.monthlyBudgetUsdCents) {
    return { allowed: false, status: 402, code: "monthly_budget_exceeded", message: "This request would exceed the monthly budget.", estimatedInputTokens, estimatedOutputTokens, estimatedCostUsdCents };
  }

  return {
    allowed: true,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsdCents,
    instructionPolicyConfigured: Boolean(context.agent.requiredInstructions)
  };
}
