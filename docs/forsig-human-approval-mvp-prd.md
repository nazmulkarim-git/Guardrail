# Forsig MVP PRD

## Product Direction

Forsig is the human approval layer for autonomous AI agents.

Forsig lets developers add human oversight to AI agents with minimal integration work. When an agent is unsure, blocked, or about to take a risky action, it pauses, sends a context-rich escalation to a human, waits for a decision, and resumes safely with an audit trail.

Forsig is not primarily an AI gateway, token tracker, budget dashboard, generic observability tool, chatbot handoff widget, or replacement for agent frameworks. It works alongside existing agent stacks and communication tools.

## Core Thesis

Production AI agents will need human judgment at important moments: approvals, corrections, missing context, risky decisions, tool failures, customer-impacting actions, and workflow handoffs.

Most teams do not want to build their own approval system, notification routing, Slack bot, email workflow, audit trail, dashboard, decision API, and resume mechanism. Forsig provides that layer.

## MVP Objective

The MVP should prove one workflow:

> A developer can integrate Forsig quickly, pause an agent at a risky or uncertain step, send full context to humans through the dashboard and notification channels, collect a decision, and resume or stop the agent.

Success means a developer can integrate Forsig into one real agent workflow in under 30 minutes and use it to approve, reject, edit, add context, or take over a task.

## Target Users

Primary users:

- AI automation agencies building client agents that need supervised actions.
- Small AI SaaS teams adding agents to support, sales, operations, billing, or internal workflows.
- Developers building production workflows with LangGraph, CrewAI, AutoGen, OpenAI Agents SDK, n8n, Make, Zapier, or custom orchestration.

Secondary users:

- Operations managers reviewing agent escalations.
- Support leads approving customer-impacting actions.
- Founders and CTOs monitoring autonomous workflows.
- Client-side reviewers for agency-built agents.

## Core Workflow

1. Agent reaches a risky, uncertain, or blocked step.
2. Developer calls the Forsig API or SDK.
3. Forsig creates an escalation request.
4. Agent pauses and waits for a decision.
5. Forsig notifies the human reviewer through dashboard and configured channels.
6. Human reviews context and chooses an action.
7. Forsig stores the decision and audit trail.
8. Agent retrieves the decision through polling, blocking wait, or webhook.
9. Agent resumes, stops, or hands off based on the decision.

## Human Decision Types

- `approved`: Human approves the proposed action.
- `rejected`: Human blocks the action and may provide a reason.
- `edited`: Human changes what the agent should do.
- `context_added`: Human gives missing information and returns control to the agent.
- `taken_over`: Human takes over the task and the agent should stop.
- `needs_more_info`: Human asks the agent to gather more context and escalate again.
- `expired`: No human responded before timeout.
- `canceled`: Escalation was canceled before resolution.

## MVP Scope

Must prove:

- Agent can create an escalation.
- Agent execution can pause while waiting for a human decision.
- Human can review context in the Forsig dashboard.
- Human can receive and act on an escalation through at least one notification channel.
- Human can approve, reject, edit, add context, or take over.
- Agent can retrieve the decision and continue.
- Dashboard keeps a full audit trail.

Do not build on day one:

- Every notification provider.
- Complex workflow graph visualization.
- Advanced RBAC.
- SOC 2-grade enterprise features.
- Full prompt-injection detection.
- Automated loop detection.
- Billing/subscriptions.
- Multi-tenant enterprise admin complexity.

## MVP Features

### Escalation API

Primary endpoint:

```http
POST /v1/escalations
Authorization: Bearer forsig_xxx
```

Example request shape:

```json
{
  "agent": {
    "id": "refund-agent",
    "name": "Refund Agent",
    "version": "1.2.0",
    "environment": "production"
  },
  "run": {
    "id": "run_123",
    "workflow": "refund-review-flow",
    "step": "refund_approval",
    "attempt": 1
  },
  "risk": {
    "type": "refund_over_limit",
    "level": "high",
    "reason": "Refund amount exceeds normal policy limit."
  },
  "task": {
    "title": "Approve refund for customer #123",
    "description": "The agent wants to issue a $500 refund to a VIP customer.",
    "proposed_action": "Issue a $500 refund",
    "customer_impact": true
  },
  "context": {
    "customer_id": "cus_123",
    "customer_tier": "VIP",
    "order_value": 1200,
    "refund_amount": 500,
    "refund_reason": "Product failed twice",
    "policy_excerpt": "Refunds above $250 require human approval."
  },
  "review": {
    "required_by": "2026-05-24T12:00:00Z",
    "allowed_actions": ["approve", "reject", "edit", "add_context", "take_over", "needs_more_info"],
    "notify": ["dashboard", "slack", "email"]
  }
}
```

Example response:

```json
{
  "id": "esc_abc123",
  "status": "pending",
  "dashboard_url": "https://app.forsig.com/escalations/esc_abc123",
  "decision_url": "https://api.forsig.com/v1/escalations/esc_abc123/decision",
  "created_at": "2026-05-24T10:00:00Z"
}
```

### Wait For Decision

Support three developer patterns:

- Blocking SDK wait for simple integrations.
- Polling with `GET /v1/escalations/{id}`.
- Webhook callback for production workflows.

Default timeout behavior should be safe:

> If no human responds before timeout, reject the risky action and stop the workflow.

### Decision API

Endpoint:

```http
POST /v1/escalations/{id}/decision
```

Example:

```json
{
  "status": "edited",
  "instruction": "Approve the refund, but issue store credit instead of cash.",
  "added_context": {
    "reason": "Customer had a similar refund last month. Store credit is safer."
  },
  "reviewer": {
    "id": "user_123",
    "name": "Nazmul Karim",
    "channel": "slack"
  }
}
```

### Dashboard Approval Inbox

Dashboard sections:

- Pending escalations.
- Resolved escalations.
- Agent activity.
- Audit trail.
- Settings.
- Notification channels.
- API keys.
- Developer docs / quickstart.

Pending cards should show agent name, workflow, run ID, risk type, risk level, proposed action, context summary, time waiting, assigned reviewer/channel, and decision buttons.

Decision actions:

- Approve.
- Reject.
- Edit instruction.
- Add context.
- Take over.
- Request more information.

Escalation detail should include summary, proposed action, why the agent escalated, context, agent trace, model metadata if submitted, decision panel, and timeline/audit trail.

### Notification Channels

MVP v1:

- Dashboard: required.
- Email: required.
- Slack: recommended.

Later:

- Discord.
- WhatsApp.
- Microsoft Teams.
- Telegram.
- SMS.
- Custom webhook.
- Zapier/n8n/Make.

Design principle:

```ts
interface NotificationProvider {
  name: string;
  sendEscalation(escalation: Escalation): Promise<NotificationResult>;
  sendReminder?(escalation: Escalation): Promise<NotificationResult>;
  sendResolution?(escalation: Escalation): Promise<NotificationResult>;
}
```

### Developer SDK

JavaScript/TypeScript should come first. Python follows soon after.

Example:

```ts
import { Forsig } from "forsig";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY
});

const decision = await forsig.escalate({
  agent: "refund-agent",
  runId: "run_123",
  task: "Approve refund for customer #123",
  risk: { type: "refund_over_limit", level: "high" },
  proposedAction: "Issue $500 refund",
  context: {
    customerTier: "VIP",
    orderValue: 1200,
    refundReason: "Product failed twice"
  },
  waitForDecision: true,
  timeout: "30m"
});

if (decision.status === "approved" || decision.status === "edited") {
  await continueWorkflow(decision.instruction, decision.addedContext);
} else if (decision.status === "rejected" || decision.status === "taken_over") {
  await stopWorkflow(decision.instruction);
}
```

## Data Model

Planned tables:

- `workspaces`
- `users`
- `api_keys`
- `agents`
- `escalations`
- `decisions`
- `notification_channels`
- `notification_attempts`
- `audit_events`

Important escalation fields:

- workspace, agent, external agent ID, run ID, workflow name, workflow step.
- status.
- risk type, level, reason.
- task title, description, proposed action.
- context JSON.
- trace JSON.
- model metadata JSON if submitted.
- allowed actions.
- notify channels.
- callback URL.
- timeout time.
- created/resolved/updated timestamps.

## Security And Privacy Principles

- Forsig should only receive context developers intentionally send.
- Developers control what data goes into escalation payloads.
- Users should avoid sending secrets or unnecessary sensitive data.
- API keys must be hashed, not stored in plaintext.
- Sensitive channel configs should be encrypted at rest.
- Audit logs should be append-only where possible.
- Do not claim enterprise certifications unless they exist.

Private beta language:

> Forsig is in private beta. Do not send highly sensitive regulated data unless you have proper authorization and safeguards.

## Success Metrics

Activation:

- Waitlist signups.
- Beta users invited.
- Workspaces created.
- API keys generated.
- Test escalations created.
- Real escalations created.

Product usage:

- Escalations created.
- Percentage resolved.
- Average decision time.
- Decisions by type.
- Channels used.
- Agent workflows integrated.

Validation:

- At least five teams integrate Forsig into a real workflow.
- At least two teams are willing to pay after trying it.

## Development Phases

1. Pivot website and demo dashboard.
2. Core escalation API.
3. Dashboard approval inbox.
4. Decision API and agent resume flow.
5. Email notification.
6. Slack notification.
7. JavaScript SDK.
8. Audit trail improvements.
9. Discord / WhatsApp based on user demand.

## Open Questions

- Which first notification channel should follow dashboard: Slack, email, Discord, or WhatsApp?
- Should public approval links exist for reviewers without accounts?
- How long should escalations be retained by default?
- Should Forsig store full message traces or summaries by default?
- Should there be a self-hosted version for sensitive teams?
- Should pricing be per seat, workspace, escalation, or agent workflow?
- Which framework integrations matter most: LangGraph, OpenAI Agents SDK, CrewAI, n8n, Make, Zapier, or custom REST?
