# Guardrail

> Formerly developed under the name **Forsig**. Existing SDK namespaces, environment variables, cookies, and API headers still use the `forsig` namespace for compatibility. The rename is being handled deliberately instead of with a breaking global search-and-replace.

**Human-in-the-loop runtime control for autonomous AI agents.**

Guardrail adds an explicit authorization checkpoint before an AI agent performs a consequential action. An agent can create an escalation, pause, wait for a human decision, and then continue, change course, or stop with a durable audit trail.

Guardrail is an early private-beta prototype. It is intentionally small and opinionated: the goal is to make the control boundary concrete before expanding into broader policy, identity, or observability infrastructure.

## Why this exists

Autonomous agents increasingly call tools that can:

- issue refunds,
- send external messages,
- modify customer or financial records,
- trigger deployments,
- change production data,
- invoke internal systems.

A tool call can be syntactically valid and still be something the business should not allow without human judgment.

Guardrail is designed around one question:

> **When an agent is about to do something consequential, who is allowed to authorize the action?**

## Core flow

```text
                         ┌────────────────────┐
                         │   Human Reviewer   │
                         └─────────┬──────────┘
                                   │
                             approve / reject
                             edit / take over
                                   │
                                   ▼
AI Agent ── escalate ──► Guardrail API ──► PostgreSQL
   ▲                           │
   │                           ├── escalation state
   │                           ├── decision
   │                           └── audit events
   │
   └──── poll / signed webhook ◄────────────────────
```

The **agent credential can request and read authorization state, but it cannot grant itself approval**. Reviewer decisions are handled through an authenticated reviewer/admin session.

## Active vs shadow mode

### Active

```text
agent → Guardrail → pause → reviewer decision → resume / stop / modify
```

### Shadow

```text
agent → Guardrail records "would have escalated" → agent continues
```

Shadow mode is for discovering where controls would fire before placing them directly in the execution path.

## What is implemented

- REST API for escalation creation, retrieval, and cancellation
- Active and shadow execution modes
- JavaScript/TypeScript SDK
- Python SDK
- Workspaces and registered agents
- Hashed API keys with hold/revoke states
- Reviewer/developer portal
- Admin review workflow
- Human decision states: approve, reject, edit, add context, take over, request more information
- PostgreSQL-backed escalation, decision, audit, and notification records
- Signed resolution webhooks
- Email and Slack notification paths
- Test modes for auto-approve / auto-reject / timeout simulation
- End-to-end smoke test
- Unit tests for payload validation, SDK behavior, and abuse controls

## Trust boundaries

**Agent / workload**
- create escalation
- read escalation
- cancel its own pending escalation
- receive the final decision

**Reviewer / administrator**
- approve
- reject
- edit
- add context
- take over

The agent-facing API key is not a reviewer credential.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md).

## Repository layout

```text
api/                         Vercel API router
server/api-routes/           backend route handlers
packages/sdk-js/             TypeScript SDK
packages/sdk-python/         Python SDK
apps/web/                    reviewer/admin/developer UI
docs/                        architecture, API, security, quickstart
examples/                    runnable integration examples
tests/                       JavaScript unit tests
scripts/                     build, local dev, E2E smoke test
```

Historical prototype code is kept under `prototypes/`.

## Quickstart

```bash
cp .env.example .env
npm install
npm run build
npm test
npm run test:python
npm run dev
```

For the private-beta SDK:

```bash
npm install @forsig/sdk
```

```ts
import { Forsig } from "@forsig/sdk";

const guardrail = new Forsig({
  apiKey: process.env.FORSIG_API_KEY!
});

const decision = await guardrail.escalate({
  agent: "refund-agent",
  risk: {
    type: "refund_over_limit",
    level: "high",
    reason: "Refund exceeds the normal policy limit."
  },
  task: {
    title: "Approve $500 refund",
    proposedAction: "Issue a $500 refund",
    customerImpact: true
  },
  mode: "active",
  waitForDecision: true,
  timeoutSeconds: 1800
});

if (decision.status === "approved") {
  // execute the consequential action
}
```

## Security properties in the MVP

- API keys are stored as SHA-256 hashes, not plaintext.
- Developer passwords use PBKDF2-SHA256.
- Session and webhook signatures use HMAC-SHA256.
- Signature comparisons are timing-safe.
- Reviewer sessions are separated from agent API credentials.
- Production webhook callbacks require HTTPS and reject loopback/private destinations.
- Production secrets are purpose-specific.
- Human decisions use an atomic state transition so two simultaneous reviewers cannot both resolve the same escalation.
- Context should be minimized. Do not send credentials, private tokens, full payment data, or unnecessary PII.

## Tests

```bash
npm test
npm run test:python
```

End-to-end smoke test:

```bash
BASE_URL=http://localhost:3000 FORSIG_ADMIN_PASSWORD=... npm run test:e2e
```

CI runs the build plus JavaScript and Python tests on pushes and pull requests.

## Current MVP limitations

Guardrail is **not presented as production-ready infrastructure**.

See [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md), including:

- instance-local rate limiting,
- polling-based blocking waits,
- API-activity-driven timeout processing,
- no durable job queue,
- no general idempotency key yet,
- deliberately limited RBAC,
- legacy `forsig` internal naming.

## Design philosophy

1. **Shadow before active.**
2. **Fail closed on unresolved consequential actions.**
3. **The actor requesting authorization must not be able to grant it.**
4. **State transitions should be deterministic and auditable.**
5. **Start with a simple architecture that makes the trust boundary visible.**
6. **Add distributed infrastructure only when load and failure modes justify it.**

## Status

Private-beta prototype / active technical exploration.

This repository represents the implementation and the engineering decisions behind the product, including the parts I would deliberately redesign before treating Guardrail as production infrastructure.
