# Architecture

## Goal

Guardrail is a small human-authorization service that sits between an autonomous workload and a consequential action.

The current architecture is intentionally simple so that the control boundary is easy to reason about.

## High-level flow

```text
┌──────────────┐       create escalation        ┌──────────────────┐
│   AI Agent   │ ─────────────────────────────► │   Guardrail API  │
└──────┬───────┘                                └────────┬─────────┘
       │                                                 │
       │                                                 ▼
       │                                         ┌───────────────┐
       │                                         │  PostgreSQL   │
       │                                         │               │
       │                                         │ workspaces    │
       │                                         │ agents        │
       │                                         │ api_keys      │
       │                                         │ escalations   │
       │                                         │ decisions     │
       │                                         │ audit_events  │
       │                                         └───────┬───────┘
       │                                                 │
       │                                                 ▼
       │                                         ┌───────────────┐
       │                                         │ Human Reviewer│
       │                                         └───────┬───────┘
       │                                                 │
       │                                        atomic decision
       │                                                 │
       │              poll / signed webhook              │
       ◄─────────────────────────────────────────────────┘
```

## Components

### Agent SDKs

`packages/sdk-js` and `packages/sdk-python`

Responsibilities:

- authenticate with an agent API key,
- create an escalation,
- fetch current escalation state,
- optionally poll until a decision exists,
- cancel a pending escalation,
- surface structured errors.

The SDK deliberately does **not** grant reviewer decisions.

### API router

`api/index.js`

Maps the public and authenticated HTTP surface to route handlers under `server/api-routes`.

### Escalation API

`server/api-routes/v1/`

Agent-facing boundary.

Allowed operations:

- create escalation,
- get escalation,
- cancel escalation.

Reviewer decisions do not use this credential boundary.

### Reviewer / developer portal

`server/api-routes/developer/`

Authenticated reviewer/developer sessions can inspect and resolve escalations for their workspace.

### Admin portal

`server/api-routes/admin/`

Administrative private-beta operations and review capabilities.

### Persistence

PostgreSQL stores workspaces, developer identities, registered agents, hashed API keys, escalations, decisions, audit events, and notification attempts.

Postgres is being used as both the system of record and the synchronization primitive for the MVP.

## State model

```text
pending
   ├── approved
   ├── rejected
   ├── edited
   ├── context_added
   ├── taken_over
   ├── needs_more_info
   ├── expired
   └── canceled
```

Only a pending escalation may transition to a terminal/reviewer state.

Reviewer resolution uses an atomic conditional update inside a database transaction. If two reviewers act concurrently, only one transition may succeed.

## Identity model

### Agent identity

Agent API keys are scoped to a workspace.

They are used to request authorization, query state, and cancel a pending request.

They cannot authorize their own requested action.

### Reviewer identity

Reviewer decisions require an authenticated developer/reviewer or admin session.

## Webhooks

A resolved escalation can notify an external application through a signed callback.

Production callback validation:

- HTTPS required,
- loopback/private/link-local targets rejected,
- HMAC-SHA256 signature,
- dedicated webhook signing secret required in production.

The preferred long-term design is pre-registered workspace webhook destinations instead of arbitrary per-request URLs.

## Failure behavior

### Reviewer does not respond

The intended policy is fail-closed: the consequential action does not silently continue.

Current timeout resolution is processed when the escalation is polled/read. A durable timeout worker is a documented next step.

### Guardrail unavailable

The SDK raises an error rather than synthesizing an approval.

For consequential actions, the recommended integration behavior is fail-closed.

### Webhook failure

The decision remains durable in PostgreSQL even if callback delivery fails. Notification attempts are recorded separately.

## Why no message broker yet?

The current volume and private-beta stage do not justify a distributed queue as a prerequisite.

The first design optimizes for fewer moving parts, easy local reproduction, understandable state transitions, and strong auditability.

A durable job/queue layer becomes justified for timeout processing, delivery retries, high event volume, and multi-region execution.
