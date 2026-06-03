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
- `forsig.escalate(payload, { waitForDecision: true })`
- `forsig.getEscalation(id)`
- `forsig.cancelEscalation(id)`

Use `waitForDecision: true` for simple workflows where the agent can pause while a human reviews the request.
