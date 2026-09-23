# Known Limitations

Guardrail is an early private-beta prototype. This file makes the current boundaries explicit.

## Reliability / scale

### Instance-local rate limiting

Rate-limit state currently lives in process memory and is not globally consistent across serverless instances.

**Production direction:** shared Redis/KV/gateway rate limiter.

### Timeout processing is activity-driven

Expired escalations are currently resolved when their state is read/polled.

**Production direction:** scheduled/durable timeout worker.

### No general idempotency key

A client retry can create another escalation if the caller does not maintain its own request identity.

**Production direction:** `Idempotency-Key` + workspace-scoped uniqueness + replay-safe response storage.

### Webhook delivery is not a durable queue

Callback attempts are recorded, but there is no durable retry worker with exponential backoff/dead-letter semantics.

**Production direction:** transactional outbox + delivery worker.

## Identity / authorization

### Limited RBAC

The private beta distinguishes workload credentials from developer/reviewer/admin sessions but does not implement a full enterprise role/permission model.

### Legacy product namespace

The repository is now named Guardrail, but existing package names, environment variables, cookies, and headers retain `forsig` identifiers.

This is deliberate to avoid a rushed breaking rename.

## Infrastructure

### Single primary database assumption

The MVP does not claim multi-region active-active behavior.

### No queue/message broker

This is currently intentional. The product is small enough that Postgres gives clearer state semantics with fewer failure modes.

## Product scope

The project is not production-certified for regulated workloads and does not claim SOC 2, HIPAA, PCI DSS, or other compliance certifications.

Users should send only the minimum context necessary for human review.
