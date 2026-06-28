const SEARCH_HINTS = {
  refund: ["refund", "createRefund", "issueRefund", "refundAmount", "reimbursement", "credit", "stripe.refunds.create", "paymentIntent refund logic", "charge refund logic", "cancel-and-refund flows", "payment-provider refund calls"],
  email: ["sendEmail", "email.send", "resend.emails.send", "sendgrid", "mailgun", "gmail", "smtp", "customer message", "outbound message"],
  deploy: ["exec", "spawn", "shell", "rm -rf", "migration", "deploy", "terraform apply", "kubectl", "delete", "truncate", "drop"],
  spend: ["paid tool", "tool purchase", "external API spend", "credits", "budget", "usage limit", "cost cap", "invoice", "billing"],
  generic: ["tool call", "external action", "production update", "customer-impacting action", "payment", "database write", "API call"]
};

function inferAction(goal) {
  const text = goal.toLowerCase();
  if (/refund|reimburse|credit/.test(text)) return "refund";
  if (/email|message|outbound|send/.test(text)) return "email";
  if (/deploy|deployment|migration|shell|delete|truncate|drop|terraform|kubectl/.test(text)) return "deploy";
  if (/spend|budget|paid tool|external tool|purchase|billing|cost|credit/.test(text)) return "spend";
  return "generic";
}

export function parsePolicyGoal(goal = "") {
  const original = goal.trim() || "risky external action";
  const action = inferAction(original);
  const thresholdMatch = original.match(/(?:above|over|greater than|more than|>)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  const exactOperator = thresholdMatch ? ">" : null;
  const currencyMatch = original.match(/\b(USD|EUR|GBP|BDT|INR|CAD|AUD|JPY)\b/i);
  const threshold = thresholdMatch ? Number(thresholdMatch[1]) : null;
  const currency = currencyMatch ? currencyMatch[1].toUpperCase() : null;
  const riskType = action === "refund" && threshold ? "refund_over_threshold"
    : action === "email" ? "external_email"
    : action === "deploy" ? "production_change"
    : action === "spend" ? "tool_spend_limit"
    : "risky_external_action";
  return {
    original,
    action,
    operator: exactOperator,
    threshold,
    currency,
    riskType,
    mode: "shadow",
    uncertain: !threshold && action === "generic"
  };
}

function preciseGoal(policy) {
  if (policy.action === "refund" && policy.threshold && policy.currency) {
    return `Add a Forsig approval checkpoint before any refund greater than ${policy.threshold} ${policy.currency} is executed. Refunds of ${policy.threshold} ${policy.currency} or less should continue without approval. Insert the checkpoint immediately before the final irreversible refund/payment-provider API call, not earlier during planning, estimation, or draft generation.`;
  }
  if (policy.action === "email") {
    return "Add a Forsig approval checkpoint before outbound customer emails or messages that could affect customers, commitments, pricing, legal exposure, or trust. Insert the checkpoint immediately before the final email/message send call, not while drafting.";
  }
  if (policy.action === "deploy") {
    return "Add a Forsig approval checkpoint before production deployments, destructive shell commands, database migrations, or production data changes. Insert the checkpoint immediately before the final irreversible execution boundary.";
  }
  if (policy.action === "spend") {
    return "Add a Forsig approval checkpoint before paid external tool calls, usage purchases, budget changes, or agent actions that spend money. Insert the checkpoint immediately before the final spend or external tool execution call.";
  }
  return `Add Forsig approval checkpoints for this risky action policy: ${policy.original}. Insert each checkpoint as close as possible to the final irreversible execution boundary, not during planning, drafting, or intermediate reasoning.`;
}

function assumptions(policy) {
  const lines = [];
  if (policy.action === "refund" && policy.threshold && policy.currency) {
    lines.push(`Approval is required only when the refund amount is greater than ${policy.threshold} ${policy.currency}.`);
    lines.push(`Refunds of exactly ${policy.threshold} ${policy.currency} or less should not require approval.`);
    lines.push("If amount or currency cannot be confidently determined, require approval or fail closed.");
    lines.push(`If the payment provider uses minor units such as cents, ${policy.threshold} ${policy.currency} equals ${Math.round(policy.threshold * 100)} cents.`);
  } else {
    lines.push("If the risky action cannot be confidently classified, require approval or fail closed.");
    lines.push("Preserve existing behavior for clearly non-risky actions.");
  }
  lines.push("Start in shadow mode unless active mode is explicitly selected.");
  return lines;
}

function toolIntro(targetTool) {
  if (targetTool === "cursor") return "Search the codebase, make minimal localized edits, keep the diff small, update relevant tests, and show a concise diff summary.";
  if (targetTool === "claude") return "Inspect first, make a short plan, implement, run available tests, and report assumptions plus changed files.";
  return "Implement the requested change, add tests, preserve existing behavior, and provide a final summary with files changed and how to verify.";
}

function frameworkGuide(framework = "plain") {
  const normalized = String(framework || "plain").toLowerCase();
  if (normalized.includes("langgraph")) {
    return "LangGraph: insert Forsig in the risky tool node before returning state. Branch graph state on approved/rejected/edited/taken_over.";
  }
  if (normalized.includes("vercel")) {
    return "Vercel AI SDK: wrap risky server actions/tool executions. Keep streaming/model calls unchanged; gate only the final external action.";
  }
  if (normalized.includes("n8n")) {
    return "n8n: add an HTTP Request node to create the escalation, pause/poll for decision, then branch with IF/Switch nodes.";
  }
  if (normalized.includes("python")) {
    return "Python: prefer a tiny Forsig helper or decorator such as @forsig.intercept(...) around the final risky function.";
  }
  if (normalized.includes("node") || normalized.includes("typescript") || normalized.includes("next")) {
    return "Node/TypeScript: prefer a small forsig.intercept(...) helper around the final tool/API call.";
  }
  return "Framework-neutral: add one small Forsig client/helper and keep the checkpoint at the final external action boundary.";
}

function installGuide(framework = "plain") {
  const normalized = String(framework || "plain").toLowerCase();
  if (normalized.includes("python")) return "pip install forsig-sdk";
  return "npm install @forsig/sdk";
}

function examplePayload(policy, agentId, baseUrl) {
  const threshold = policy.threshold ?? 500;
  const currency = policy.currency ?? "USD";
  const actionLabel = policy.action === "refund" ? `refund above ${threshold} ${currency}` : policy.original;
  return {
    agent: { id: agentId, name: "Test Agent", environment: "production" },
    mode: policy.mode || "shadow",
    risk: {
      type: policy.riskType,
      level: "high",
      reason: policy.action === "refund" ? `Refund exceeds ${threshold} ${currency} and requires human approval before execution.` : "Risky external action would require human approval before execution."
    },
    task: {
      title: `Review ${actionLabel}`,
      proposedAction: policy.action === "refund" ? `Issue a refund above ${threshold} ${currency}` : `Execute risky action: ${policy.original}`,
      customerImpact: true
    },
    context: {
      ...(policy.action === "refund" ? { refundAmount: String(threshold + 0.01), currency, threshold: threshold.toFixed(2) } : {}),
      includeOnly: "small reviewer-safe facts needed to decide"
    },
    review: { notify: ["dashboard", "email"] },
    timeoutSeconds: 900
  };
}

export function generateIntegrationPrompt({
  goal = "",
  targetTool = "codex",
  agentId = "test-agent",
  baseUrl = "https://www.forsig.com",
  framework = "plain Node or Python agent",
  mode = "shadow",
  reviewerEmails = "",
  sdkPackage = "@forsig/sdk"
} = {}) {
  const policy = parsePolicyGoal(goal);
  policy.mode = mode || "shadow";
  const hints = SEARCH_HINTS[policy.action] || SEARCH_HINTS.generic;
  const payload = examplePayload(policy, agentId, baseUrl);
  const reviewers = String(reviewerEmails || "").trim();
  return `You are editing my existing codebase. Integrate Forsig human approval checkpoints with the smallest safe change set.

Tool style:
${toolIntro(targetTool)}

Goal:
${preciseGoal(policy)}

Target stack:
- Framework/runtime: ${framework}
- Install command: ${installGuide(framework)}
- SDK package name to prefer when available: ${sdkPackage}
- Integration pattern: ${frameworkGuide(framework)}

Assumptions:
${assumptions(policy).map((line) => `- ${line}`).join("\n")}

Forsig details:
- Base URL: ${baseUrl}
- API key env var: FORSIG_API_KEY
- Runtime mode env var: FORSIG_MODE
- Default mode: ${policy.mode}
- Supported modes:
  - shadow: log that approval would have been required, but do not block execution
  - active: wait for human approval before executing the risky action
- Default agent id/slug: ${agentId}
- Default reviewer emails: ${reviewers || "use workspace defaults from Forsig settings"}
- Use minimal review context only. Never send secrets, passwords, API keys, full payment details, raw payment method data, or unnecessary personal data to Forsig.
- Real escalations should notify reviewers by email and dashboard. Test/shadow escalations may stay dashboard-only unless configured otherwise.

Decision handling:
- shadow_logged: continue execution, because this is a simulated checkpoint
- approved: continue with the proposed action
- rejected: stop safely and do not execute the risky action
- edited/context_added/needs_more_info: only continue if the returned instruction can be safely mapped to the current workflow. Do not execute unrelated actions from free-text reviewer instructions. If unclear, stop autonomous execution or mark the task as human-owned.
- taken_over: stop autonomous execution and mark the task as human-owned
- timeout/no decision: fail closed and do not execute the risky action in active mode

Implementation instructions:
1. Search the codebase for risky execution paths. Look for: ${hints.join(", ")}.
2. Identify the final execution boundary where the action is actually sent, committed, deployed, or run.
3. Insert the Forsig checkpoint as close as possible to the final irreversible execution boundary, not during planning, drafting, or intermediate reasoning.
4. Add a small Forsig client/helper if one does not exist. Prefer ${sdkPackage} if it is already available; otherwise add a minimal fetch/requests helper with the same behavior.
5. In shadow mode, log that approval would have been required but do not block execution.
6. In active mode, wait for approval and fail closed on rejection, timeout, or no decision.
7. Keep payloads small and reviewer-safe. Redact secrets and avoid unnecessary personal data.
8. Do not refactor unrelated code. Do not change unrelated business logic, auth, database schema, payment provider config, or deployment config unless required.
9. Preserve existing behavior for non-risky actions.
10. Add reviewer notification routing where the app already has email/team config. Use ${reviewers || "Forsig workspace default reviewers"} for first pass.
11. Update README/env docs with FORSIG_API_KEY, FORSIG_MODE, reviewer settings, and the local test command only where relevant.

Suggested helper API:
- createEscalation(payload): creates a Forsig escalation
- waitForDecision(id): polls or waits for the reviewer decision
- requireApproval({ risk, task, context, mode }): returns a structured decision
- handleDecision(decision): approved continues, shadow_logged continues, rejected/taken_over/timeout stops, edited only continues when safely mapped

Tests to add or update:
- below-threshold action does not require approval
- exact-threshold behavior
- above-threshold action creates or would create a Forsig checkpoint
- approved decision continues
- rejected decision stops safely
- edited decision safely changes behavior only when applicable
- context_added / needs_more_info stops or gathers context safely
- taken_over stops autonomous execution
- timeout/no decision fails closed in active mode
- shadow mode logs but does not block
- currency minor units are handled correctly when relevant
- missing or ambiguous amount/currency requires approval or fails closed when relevant

Example escalation payload:
${JSON.stringify(payload, null, 2)}

After implementing, show me:
- files changed
- where each Forsig checkpoint was inserted
- whether integration is shadow or active
- how threshold logic works
- how currency/minor units are handled, if relevant
- how to run tests
- how to run a real escalation/shadow test
- how reviewer email notifications are configured
- assumptions or missing env vars
- uncertain risky action locations
- any skipped files or TODOs`;
}
