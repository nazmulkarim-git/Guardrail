# Forsig Quickstart

Forsig is human-approval infrastructure for autonomous AI agents. Call Forsig when an agent is about to do something risky, wait for a reviewer decision, and continue safely.

## 1. Create an agent

Open `/developer`, go to **Agents**, and create an agent such as:

- Name: `Refund Agent`
- Slug: `refund-agent`
- Environment: `production`

Use the slug as `agent.id` in your code.

## 2. Create an API key

Open **API Keys** and create a test key. Copy it once and store it as:

```bash
FORSIG_API_KEY=fsk_test_xxx
```

## 3. Install the SDK

```bash
npm install @forsig/sdk
```

## 4. Escalate a risky action

```ts
import { Forsig } from "@forsig/sdk";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY!,
  baseUrl: "https://www.forsig.com"
});

const decision = await forsig.escalate({
  agent: { id: "refund-agent", name: "Refund Agent", environment: "production" },
  run: { id: "run_123", workflow: "refund-review-flow", step: "refund_approval" },
  risk: { type: "refund_over_limit", level: "high", reason: "Refund exceeds policy limit." },
  task: {
    title: "Approve refund for customer #123",
    proposedAction: "Issue a $500 refund",
    customerImpact: true
  },
  context: { customerTier: "VIP", orderValue: 1200, refundAmount: 500 },
  review: {
    notify: ["dashboard", "email"],
    reviewerEmail: "reviewer@example.com"
  },
  callbackUrl: "https://your-app.com/forsig/webhook",
  waitForDecision: true,
  timeoutSeconds: 1800
});

console.log(decision.status, decision.instruction);
```

Private beta note: send only the minimum context needed for human review. Avoid secrets, credentials, unnecessary PII, and regulated data.

## Test Modes

Use these only while testing:

- `manual`: reviewer decides in Forsig.
- `auto_approve`: Forsig approves after the agent polls the escalation for at least five seconds.
- `auto_reject`: Forsig rejects after polling.
- `auto_timeout`: Forsig simulates the safest timeout path and rejects.

```ts
await forsig.escalate({
  agent: "refund-agent",
  risk: "refund_over_limit",
  task: { title: "Approve refund", proposedAction: "Issue $500 refund" },
  review: { testMode: "auto_approve" },
  waitForDecision: true,
  timeoutSeconds: 20
});
```
