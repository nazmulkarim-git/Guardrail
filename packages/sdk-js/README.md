# Forsig TypeScript SDK

Official TypeScript SDK for Forsig, the human-approval checkpoint for autonomous AI agents.

Use it when your agent is about to take a risky action, such as issuing a refund, sending an external email, deploying code, changing production data, or spending money through a tool call.

## Install

```bash
npm install @forsig/sdk
```

## Quickstart

```ts
import { Forsig } from "@forsig/sdk";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY!
});

const decision = await forsig.escalate({
  agent: {
    name: "refund-agent",
    version: "1.0.0",
    environment: "production"
  },
  workflow: "refund-review",
  step: "refund_over_limit",
  task: {
    title: "Approve refund for customer #123",
    description: "The agent wants to issue a $500 refund.",
    customerImpact: true
  },
  risk: {
    type: "refund_over_limit",
    level: "high",
    reason: "Refund exceeds the normal approval limit."
  },
  proposedAction: "Issue a $500 refund to customer #123.",
  context: {
    amount: 500,
    currency: "USD",
    customerTier: "VIP"
  },
  waitForDecision: true
});

if (decision.status === "approved") {
  // Continue the action.
}
```

## Shadow mode

Shadow mode logs what Forsig would have escalated without blocking your agent.

```ts
await forsig.escalate({
  mode: "shadow",
  agent: "sales-agent",
  task: "Review outbound discount email",
  risk: "external_email",
  proposedAction: "Send custom offer email to a prospect."
});
```

## Decisions

If you do not want the SDK to wait, create an escalation and poll or fetch it later.

```ts
const escalation = await forsig.escalate({
  agent: "deployment-agent",
  task: "Review production migration",
  risk: { type: "production_change", level: "critical" },
  proposedAction: "Run a migration touching billing records."
});

const latest = await forsig.getEscalation(escalation.id);
```

## Metadata headers

Use `forsigHeaders` when you proxy model or tool requests through your own infra and want consistent trace metadata.

```ts
import { forsigHeaders, newForsigSession } from "@forsig/sdk";

const headers = forsigHeaders({
  agentId: "refund-agent",
  sessionId: newForsigSession(),
  externalUserId: "customer_123",
  metadata: {
    plan: "enterprise"
  }
});
```

## Safety note

Send the minimum context a reviewer needs. Do not send API keys, passwords, private tokens, full payment records, or unnecessary customer data.

## API surface

- `new Forsig({ apiKey, baseURL?, fetch? })`
- `forsig.escalate(input)`
- `forsig.getEscalation(id)`
- `forsig.cancelEscalation(id)`
- `forsig.waitForDecision(id, options?)`
- `forsigHeaders(input?)`
- `newForsigSession(prefix?)`
- `parseForsigError(error)`

## Publish checklist

Before publishing, choose the license you want and replace `UNLICENSED` in `package.json` if the SDK should be open source.

```bash
npm pack --dry-run
npm publish --access public
```
