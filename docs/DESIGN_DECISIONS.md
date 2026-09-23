# Design Decisions

## 1. PostgreSQL as the first system of record

**Choice:** keep escalation, decision, identity, and audit state in PostgreSQL.

**Why now:** transactional state transitions, straightforward audit queries, fewer distributed components, easy local/private-beta operation.

**Later:** high-volume event ingestion, delivery retries, or cross-region processing may justify a queue/event log.

## 2. Polling before realtime infrastructure

**Choice:** SDK `waitForDecision` uses short polling.

**Why now:** predictable, framework-independent, and easy to debug.

**Tradeoff:** inefficient for very long waits and high concurrency.

## 3. Shadow mode before enforcement

Shadow allows teams to observe where the control would fire without blocking production.

## 4. Fail closed for consequential actions

A missing human decision is not equivalent to approval.

## 5. Separate requester from approver

The agent/workload that asks for permission cannot use the same credential to grant it.

Agent API key: create, read, cancel.

Reviewer session: approve, reject, edit, add context, take over.

## 6. Atomic reviewer decisions

Two simultaneous reviewers must not both successfully resolve the same pending escalation.

The implementation uses a transaction plus a conditional update:

```sql
update escalations
set status = ...
where id = ...
  and status = 'pending'
returning ...
```

## 7. Hashed API keys

Raw API keys are shown at creation time but persisted as hashes.

## 8. Signed webhook callbacks

Resolution callbacks use HMAC-SHA256 with a purpose-specific production secret.

## 9. SSRF-aware callback validation

Production callbacks require HTTPS and reject obvious private, loopback, and link-local hosts.

Long term, callback destinations should be registered at the workspace level.

## 10. No distributed rate limiter yet

The current in-memory limiter is a private-beta abuse control, not a production distributed limiter.

## 11. No broad platform claim

The MVP is intentionally not full governance, full observability, agent IAM, an LLM gateway, or an enterprise compliance suite.

The narrow thesis is human authorization for consequential agent actions.
