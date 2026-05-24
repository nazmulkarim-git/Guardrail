type ForsigError = {
  error: {
    type: string;
    code: string;
    message: string;
  };
};

export type EscalationRequest = {
  agent: string;
  runId: string;
  task: string;
  risk: string;
  proposedAction: string;
  context?: Record<string, unknown>;
};

export type ReviewerDecision = {
  status: "pending" | "approved" | "rejected" | "edited" | "expired";
  instruction?: string;
  reviewer?: string;
  auditId?: string;
};

export function forsigError(status: number, code: string, message: string): Response {
  const body: ForsigError = {
    error: {
      type: "forsig_approval_error",
      code,
      message
    }
  };
  return Response.json(body, { status });
}

export function createMockEscalation(request: EscalationRequest): ReviewerDecision {
  return {
    status: "pending",
    instruction: `Waiting for approval: ${request.proposedAction}`,
    reviewer: "unassigned",
    auditId: `audit_${request.runId.replace(/[^a-z0-9]/gi, "").slice(-6) || "demo"}`
  };
}
