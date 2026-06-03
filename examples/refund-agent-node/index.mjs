import { Forsig } from "@forsig/sdk";

const apiKey = process.env.FORSIG_API_KEY;
if (!apiKey) {
  console.error("Set FORSIG_API_KEY before running this example.");
  process.exit(1);
}

const forsig = new Forsig({
  apiKey,
  baseUrl: process.env.FORSIG_BASE_URL || "https://www.forsig.com"
});

console.log("Creating refund approval escalation...");

const decision = await forsig.escalate({
  agent: { id: "refund-agent", name: "Refund Agent", environment: "production" },
  run: { id: `run_${Date.now()}`, workflow: "refund-review-flow", step: "refund_approval" },
  risk: { type: "refund_over_limit", level: "high", reason: "Refund exceeds $250 policy limit." },
  task: {
    title: "Approve refund for customer #123",
    proposedAction: "Issue a $500 refund",
    customerImpact: true
  },
  context: {
    customerTier: "VIP",
    orderValue: 1200,
    refundAmount: 500,
    refundReason: "Product failed twice"
  },
  waitForDecision: true,
  timeoutSeconds: 1800,
  pollIntervalMs: 2000
});

console.log("Forsig decision received:");
console.log(JSON.stringify(decision, null, 2));

if (decision.status === "approved") {
  console.log("Refund approved. Proceeding.");
} else if (decision.status === "edited" || decision.status === "context_added") {
  console.log(`Follow human instruction: ${decision.instruction}`);
} else {
  console.log(`Stop workflow: ${decision.instruction || decision.status}`);
}
