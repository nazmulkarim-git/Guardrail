# JavaScript SDK

Install:

```bash
npm install @forsig/sdk
```

Create a client:

```ts
import { Forsig } from "@forsig/sdk";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY!,
  baseUrl: "https://www.forsig.com"
});
```

Methods:

- `forsig.escalate(payload)`
- `forsig.getEscalation(id)`
- `forsig.cancelEscalation(id)`
- `forsig.decide(id, decision)`

Use `waitForDecision: true` for simple workflows where the agent can pause while a human reviews the request.

Test mode:

```ts
await forsig.escalate({
  agent: "refund-agent",
  risk: { type: "refund_over_limit", level: "high" },
  task: {
    title: "Approve refund",
    proposedAction: "Issue a $500 refund"
  },
  review: { testMode: "auto_approve" },
  waitForDecision: true,
  timeoutSeconds: 20
});
```

Callback webhooks:

```ts
await forsig.escalate({
  agent: "refund-agent",
  risk: "refund_over_limit",
  task: { title: "Approve refund", proposedAction: "Issue $500 refund" },
  callbackUrl: "https://your-app.com/forsig/webhook"
});
```
