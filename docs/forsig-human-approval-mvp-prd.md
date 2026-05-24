# Forsig MVP PRD v2

## 1. Product Direction

Forsig is the **human intervention layer for AI agents**.

Forsig lets developers add controlled human review points to risky AI agent workflows. When an agent is uncertain, blocked, or about to perform a customer-impacting, money-impacting, data-changing, or reputation-risking action, Forsig pauses the workflow, creates a secure human review checkpoint, collects a structured human decision, and returns that decision to the agent or application.

Forsig is not primarily an AI gateway, model proxy, token tracker, budget dashboard, generic observability tool, chatbot handoff widget, or replacement for agent frameworks. It works alongside existing agent stacks and communication tools.

Forsig does **not** execute customer actions. It does not send the email, issue the refund, update the CRM, run the shell command, or call the customer’s production tool. Forsig only captures the proposed action, presents it to a human, records the decision, and returns a structured result to the developer’s application. The developer’s system remains responsible for final execution.

## 2. Core Thesis

Production AI agents will need human judgment at important moments.

These moments include:

* risky approvals
* customer-impacting actions
* money movement
* sensitive communication
* missing context
* uncertain decisions
* tool failures
* policy exceptions
* workflow handoffs
* human takeover situations

Most teams do not want to build their own review inbox, notification routing, approval UI, audit log, decision API, webhook system, timeout logic, Slack bot, email workflow, and agent-resume mechanism.

Forsig provides this layer as a simple developer API.

The wedge is not simply “approve or reject.”

The wedge is:

> Let humans approve, reject, edit, instruct, or take over risky AI agent actions.

## 3. MVP Objective

The MVP should prove one workflow:

> A developer can integrate Forsig quickly, pause an agent at a risky step, show the proposed action and context to a human, let the human approve, reject, edit, instruct, or take over, then return the structured decision to the agent with an audit trail.

Success means a developer can integrate Forsig into one real agent workflow in under 30 minutes and use it in a real human-reviewed agent action.

## 4. Primary ICP

### Primary beta ICP

AI automation agencies and solo AI consultants building client-facing AI workflows.

These users need a way to tell clients:

> Your AI agent cannot perform risky actions without human review. You can approve, edit, or take over before anything happens.

This is the clearest early wedge because Forsig helps agencies sell trust.

### Secondary users

* Small AI SaaS teams adding agents to support, sales, operations, billing, or internal workflows.
* Developers building production workflows with LangGraph, CrewAI, AutoGen, OpenAI Agents SDK, Vercel AI SDK, n8n, Make, Zapier, or custom orchestration.
* Operations managers reviewing agent interventions.
* Support leads approving customer-impacting actions.
* Founders and CTOs monitoring autonomous workflows.
* Client-side reviewers for agency-built agents.

## 5. Positioning

### Public-facing category

**Human intervention API for AI agents**

### Public-facing headline

**Let humans approve, edit, or take over risky AI agent actions.**

### Subheadline

Add secure human review checkpoints to AI agents in minutes. Pause risky actions, notify a reviewer, collect a decision, and resume safely with an audit trail.

### Simple explanation

When your AI agent is about to do something risky, Forsig creates a human checkpoint. A human can approve, reject, edit, give instructions, or take over. Forsig returns the decision to your app.

### Competitive positioning

Big AI-infra platforms may add simple approval features. Forsig wins by being the dedicated, framework-agnostic human intervention layer.

Forsig should work across:

* OpenAI Agents SDK
* LangGraph
* CrewAI
* Vercel AI SDK
* n8n
* Make
* Zapier
* custom agents
* MCP-based tools
* internal scripts
* browser agents
* support bots
* sales agents
* DevOps agents

Forsig should not require:

* model proxy migration
* gateway migration
* framework migration
* tool credential sharing
* production system access
* secrets from the customer

## 6. Core Workflow

1. Agent reaches a risky, uncertain, blocked, or customer-impacting step.
2. Developer calls the Forsig API or SDK.
3. Forsig creates an intervention request.
4. Agent pauses and waits for a human decision.
5. Forsig creates a secure review page.
6. Forsig notifies the human reviewer through configured channels.
7. Human reviews the proposed action and context.
8. Human chooses a structured decision.
9. Forsig stores the decision and audit trail.
10. Agent retrieves the decision through blocking wait, polling, or webhook.
11. Agent resumes, stops, changes behavior, or hands off based on the decision.

## 7. Core Product Object

The core object should be called an **intervention**.

An intervention is a human control checkpoint inside an AI agent workflow.

Avoid making “escalation” the main product word. Escalation can still be used internally or as a secondary term, but the primary category should be intervention.

Recommended API naming:

```http
POST /v1/interventions
```

Recommended SDK naming:

```ts
forsig.intervene()
```

## 8. Human Decision Types

The MVP should support five main human decisions.

### 1. `approved`

The human approves the proposed action as-is.

Agent behavior:

* continue with original proposed action

Example:

```json
{
  "status": "approved",
  "comment": "Looks valid. Proceed."
}
```

### 2. `rejected`

The human blocks the proposed action.

Agent behavior:

* stop the risky action
* optionally continue with a safer fallback

Example:

```json
{
  "status": "rejected",
  "comment": "Customer is not eligible for this refund."
}
```

### 3. `edited_approved`

The human edits the proposed action and approves the edited version.

Agent behavior:

* execute the edited version, not the original proposal

Example:

```json
{
  "status": "edited_approved",
  "comment": "Refund store credit instead of cash.",
  "edited_action": {
    "refund_type": "store_credit",
    "amount": 500
  }
}
```

### 4. `instruct_agent`

The human gives additional context, direction, or constraints and returns control to the agent.

Agent behavior:

* continue reasoning using the human instruction

Example:

```json
{
  "status": "instruct_agent",
  "instruction": "Ask the customer for photos of the damaged item before offering a refund."
}
```

### 5. `human_takeover`

The human takes over the task and the agent should stop handling it.

Agent behavior:

* stop workflow
* mark task as human-owned
* optionally notify user/customer that a human is handling it

Example:

```json
{
  "status": "human_takeover",
  "assignee": "ops@company.com",
  "comment": "VIP customer. Human will handle manually."
}
```

### System-generated statuses

These should also exist:

* `pending`
* `expired`
* `canceled`
* `webhook_failed`
* `resolved`

### Delay or merge for v1

The previous PRD included `needs_more_info`. For MVP, this can be modeled as `instruct_agent`.

Example:

```json
{
  "status": "instruct_agent",
  "instruction": "Gather the last 3 customer orders and escalate again."
}
```

A dedicated `needs_more_info` status can be added later if users need it.

## 9. MVP Scope

The MVP must prove:

* Developer can create an intervention.
* Agent execution can pause while waiting for a human decision.
* Human can review proposed action and context in a secure Forsig review page.
* Human can receive a notification through at least one channel.
* Human can approve, reject, edit, instruct, or take over.
* Agent can retrieve the decision and continue, stop, change, or hand off.
* Forsig keeps a useful audit trail.

## 10. MVP Non-Goals

Do not build on day one:

* every notification provider
* complex workflow graph visualization
* advanced RBAC
* SOC 2-grade enterprise features
* full prompt-injection detection
* automated loop detection
* billing/subscription system
* complex organization admin
* Microsoft Teams
* WhatsApp
* Discord
* Telegram
* SMS
* self-hosted deployment
* full MCP gateway
* model proxy
* AI observability platform
* complex policy engine
* full AgentAuth identity layer

## 11. MVP Product Shape

The smallest valuable product is:

1. Intervention API
2. JavaScript/TypeScript SDK
3. Secure web review page
4. Email notification
5. Optional Slack notification if easy
6. Human decision form
7. Blocking wait, polling, and webhook result patterns
8. Basic audit log
9. API key management
10. Minimal dashboard/inbox

## 12. Channel Strategy

Forsig should be channel-agnostic from the beginning.

The core product is the intervention object and secure review page. Notification channels are adapters.

### MVP channel priority

1. **Web review page** — required, core product
2. **Email notification** — required, universal
3. **Slack notification** — recommended, demo-friendly
4. **Discord / WhatsApp / Teams / Telegram / SMS** — later, based on demand

Slack should not be Forsig’s identity.

Forsig should not be positioned as “Slack approvals for AI agents.”

Better:

> Human intervention API for AI agents.

### Notification provider design principle

```ts
interface NotificationProvider {
  name: string;
  sendIntervention(intervention: Intervention): Promise<NotificationResult>;
  sendReminder?(intervention: Intervention): Promise<NotificationResult>;
  sendResolution?(intervention: Intervention): Promise<NotificationResult>;
}
```

## 13. Intervention API

### Create intervention

```http
POST /v1/interventions
Authorization: Bearer forsig_xxx
Content-Type: application/json
```

### Example request

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
    "title": "Review refund for customer #123",
    "description": "The agent wants to issue a $500 refund to a VIP customer.",
    "action_type": "shopify.refund",
    "customer_impact": true
  },
  "proposed_action": {
    "type": "refund",
    "amount": 500,
    "currency": "USD",
    "refund_method": "original_payment_method",
    "customer_id": "cus_123",
    "order_id": "ord_456"
  },
  "context": {
    "customer_tier": "VIP",
    "order_value": 1200,
    "refund_reason": "Product failed twice",
    "policy_excerpt": "Refunds above $250 require human approval."
  },
  "review": {
    "required_by": "2026-05-24T12:00:00Z",
    "allowed_decisions": [
      "approve",
      "reject",
      "edit",
      "instruct_agent",
      "human_takeover"
    ],
    "notify": ["email", "slack"],
    "reviewers": ["ops@company.com"]
  },
  "callback_url": "https://customer-app.com/forsig/webhook"
}
```

### Example response

```json
{
  "id": "int_abc123",
  "status": "pending",
  "review_url": "https://app.forsig.com/interventions/int_abc123",
  "decision_url": "https://api.forsig.com/v1/interventions/int_abc123/decision",
  "created_at": "2026-05-24T10:00:00Z",
  "expires_at": "2026-05-24T12:00:00Z"
}
```

## 14. Wait For Decision

Forsig should support three developer patterns.

### 1. Blocking SDK wait

Best for simple integrations and demos.

```ts
const decision = await forsig.intervene({
  title: "Review refund request",
  proposedAction: refundPayload,
  waitForDecision: true,
  timeout: "30m"
});
```

### 2. Polling

Best for systems that already manage job state.

```http
GET /v1/interventions/{id}
```

### 3. Webhook callback

Best for production workflows.

Forsig sends the final decision to the developer’s callback URL.

Default timeout behavior should be safe:

> If no human responds before timeout, reject the risky action and stop the workflow.

## 15. Decision API

### Submit decision

```http
POST /v1/interventions/{id}/decision
Authorization: Bearer forsig_xxx
Content-Type: application/json
```

### Example: approved

```json
{
  "status": "approved",
  "comment": "Proceed. Customer is eligible."
}
```

### Example: edited and approved

```json
{
  "status": "edited_approved",
  "comment": "Issue store credit instead of cash refund.",
  "edited_action": {
    "type": "refund",
    "amount": 500,
    "currency": "USD",
    "refund_method": "store_credit"
  }
}
```

### Example: instruct agent

```json
{
  "status": "instruct_agent",
  "instruction": "Ask the customer for photos of the damaged product before refunding."
}
```

### Example: human takeover

```json
{
  "status": "human_takeover",
  "assignee": "ops@company.com",
  "comment": "VIP customer. Human will handle manually."
}
```

### Decision response returned to agent

```json
{
  "intervention_id": "int_abc123",
  "status": "edited_approved",
  "comment": "Issue store credit instead of cash refund.",
  "edited_action": {
    "type": "refund",
    "amount": 500,
    "currency": "USD",
    "refund_method": "store_credit"
  },
  "decided_by": {
    "id": "user_123",
    "name": "Human Reviewer",
    "email": "ops@company.com",
    "channel": "web"
  },
  "decided_at": "2026-05-24T10:18:00Z"
}
```

## 16. JavaScript/TypeScript SDK

JavaScript/TypeScript should come first.

Python can follow after clear demand.

### Install

```bash
npm install forsig
```

### Example usage

```ts
import { Forsig } from "forsig";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY
});

const decision = await forsig.intervene({
  agent: {
    id: "refund-agent",
    name: "Refund Agent"
  },
  run: {
    id: "run_123",
    workflow: "refund-review-flow",
    step: "refund_approval"
  },
  task: {
    title: "Review refund for customer #123",
    actionType: "shopify.refund"
  },
  risk: {
    type: "refund_over_limit",
    level: "high",
    reason: "Refund amount exceeds policy limit."
  },
  proposedAction: {
    type: "refund",
    amount: 500,
    refundMethod: "original_payment_method"
  },
  context: {
    customerTier: "VIP",
    orderValue: 1200,
    refundReason: "Product failed twice"
  },
  allowedDecisions: [
    "approve",
    "reject",
    "edit",
    "instruct_agent",
    "human_takeover"
  ],
  notify: ["email"],
  waitForDecision: true,
  timeout: "30m"
});

switch (decision.status) {
  case "approved":
    await issueRefund(originalRefundPayload);
    break;

  case "edited_approved":
    await issueRefund(decision.editedAction);
    break;

  case "instruct_agent":
    await agent.continue(decision.instruction);
    break;

  case "rejected":
    await stopWorkflow(decision.comment);
    break;

  case "human_takeover":
    await markTaskAsHumanOwned(decision.assignee, decision.comment);
    break;

  case "expired":
    await stopWorkflow("No human decision before timeout.");
    break;
}
```

## 17. Web Review Page

The web review page is the core MVP interface.

It should be usable without relying on Slack or any specific chat tool.

### Review page must show

* intervention title
* agent name
* workflow/run/step
* risk level
* risk reason
* proposed action
* context summary
* raw context JSON toggle
* time created
* expiration time
* current status
* decision buttons
* comment/instruction input
* edit proposed action input
* audit timeline

### Main decision buttons

* Approve
* Reject
* Edit & approve
* Instruct agent
* Take over

### UX principle

The reviewer should understand three things quickly:

1. What does the agent want to do?
2. Why is this risky or uncertain?
3. What decision should I make?

## 18. Minimal Dashboard

Do not overbuild a large admin dashboard in MVP.

The dashboard should only include:

1. Pending interventions
2. Resolved interventions
3. Intervention detail page
4. API keys
5. Basic notification settings
6. Basic audit log
7. Quickstart/docs link

Delay:

* full agent activity analytics
* complex workspace settings
* advanced user management
* charts
* workflow graphs
* compliance exports
* policy builder

## 19. Audit Trail

Every intervention should have an audit trail.

Minimum audit events:

* intervention created
* notification sent
* notification failed
* reviewer opened page
* decision submitted
* webhook sent
* webhook failed
* intervention expired
* intervention canceled

Audit entries should include:

* timestamp
* actor type: system, agent, reviewer, developer
* actor identifier if available
* event type
* metadata JSON

This is a core trust feature.

Forsig should eventually make audit logs append-only where possible.

## 20. Security and Privacy Principles

Forsig must be trusted from the beginning.

### Principles

* Forsig does not execute customer actions.
* Forsig only receives context developers intentionally send.
* Developers control what data goes into intervention payloads.
* Users should avoid sending secrets or unnecessary sensitive data.
* API keys must be hashed, not stored in plaintext.
* Sensitive channel configs should be encrypted at rest.
* Review links should be signed and expire.
* Decisions should be one-time and immutable after submission.
* Webhooks should be signed.
* Timeout defaults should fail closed for risky actions.
* Audit logs should be append-only where possible.
* Do not claim enterprise certifications unless they exist.

### Private beta language

> Forsig is in private beta. Do not send highly sensitive regulated data unless you have proper authorization and safeguards.

## 21. Data Model

### Planned tables

* `workspaces`
* `users`
* `api_keys`
* `agents`
* `interventions`
* `decisions`
* `notification_channels`
* `notification_attempts`
* `audit_events`
* `webhook_attempts`

### Important intervention fields

* workspace ID
* agent ID
* external agent ID
* run ID
* workflow name
* workflow step
* status
* risk type
* risk level
* risk reason
* task title
* task description
* action type
* proposed action JSON
* context JSON
* optional trace JSON
* optional model metadata JSON
* allowed decisions
* notify channels
* reviewers
* callback URL
* timeout time
* created timestamp
* resolved timestamp
* updated timestamp

### Important decision fields

* intervention ID
* status
* comment
* instruction
* edited action JSON
* assignee
* reviewer ID
* reviewer channel
* decided timestamp

## 22. Success Metrics

### Activation metrics

* waitlist signups
* beta users invited
* workspaces created
* API keys generated
* first test intervention created
* first real intervention created
* SDK installed
* webhook configured

### Product usage metrics

* interventions created
* real interventions created
* percentage resolved
* percentage expired
* average decision time
* decisions by type
* edited approvals created
* human takeovers created
* instruct-agent decisions created
* notification channels used
* agent workflows integrated

### Validation metrics

The MVP is validated when:

* at least 5 teams integrate Forsig into a real workflow
* at least 2 teams are willing to pay after trying it
* at least 1 AI automation agency uses Forsig in a client workflow
* at least 10 real interventions happen outside demo/test usage
* at least 1 real edit, instruction, or takeover happens

The most important validation is not just approval volume.

The strongest validation is:

> A real human changed, guided, or took over an AI agent action through Forsig.

## 23. Pricing Hypothesis

Do not overbuild billing in MVP.

For private beta:

> Free during beta. Paid when used in production.

Early pricing hypothesis:

| Plan    |      Price | Limit                                      |
| ------- | ---------: | ------------------------------------------ |
| Free    |         $0 | 100 interventions/month                    |
| Starter |  $19/month | 1,000 interventions/month                  |
| Pro     |  $99/month | 10,000 interventions/month                 |
| Team    | $299/month | team review routing + longer audit history |

Pricing can evolve around:

* interventions/month
* retained audit history
* team seats
* notification channels
* agency/client workspaces
* compliance features

## 24. Development Phases

### Phase 1: Positioning and demo

* Update website positioning.
* Build landing page around human intervention/takeover.
* Create 20-second demo video.
* Show agent pausing, human reviewing, editing/taking over, and audit log updating.

### Phase 2: Core API

* Create intervention endpoint.
* Store proposed action and context.
* Generate secure review URL.
* Generate API key.
* Create basic workspace.

### Phase 3: Review page

* Build intervention detail page.
* Add approve/reject/edit/instruct/takeover actions.
* Add audit timeline.
* Add raw JSON/context view.

### Phase 4: Decision return flow

* Blocking SDK wait.
* Polling endpoint.
* Webhook callback.
* Safe timeout behavior.

### Phase 5: Email notification

* Send intervention email.
* Include secure review link.
* Add notification attempt records.

### Phase 6: JavaScript/TypeScript SDK

* `forsig.intervene()`
* wait for decision
* webhook helper utilities
* TypeScript types
* examples

### Phase 7: Minimal dashboard

* Pending interventions
* Resolved interventions
* API key page
* Basic notification settings
* Quickstart/docs

### Phase 8: Slack notification

* Slack app or webhook-based integration.
* Notify channel/user.
* Link back to review page.
* Optional Slack buttons later.

### Phase 9: Beta integrations and templates

Create examples for:

* OpenAI Agents SDK
* LangGraph
* CrewAI
* Vercel AI SDK
* n8n
* custom REST

## 25. First Demo Scenarios

### Demo 1: Refund agent

Agent wants to issue a $500 refund.

Human can:

* approve refund
* reject refund
* edit to store credit
* instruct agent to ask for photos
* take over VIP customer case

### Demo 2: Email agent

Agent wants to send a sensitive customer email.

Human can:

* approve email
* rewrite email
* instruct agent to soften tone
* take over the conversation

### Demo 3: DevOps agent

Agent wants to run a production command.

Human can:

* approve command
* reject command
* edit command
* instruct agent to run diagnostics first
* take over incident response

## 26. Go-To-Market Wedge

Start with AI automation agencies and developers building client-facing AI agents.

### Core message for agencies

> Add client approval, editing, and takeover to every AI workflow you build.

### Outreach question

Do not ask:

> Would you use Forsig?

Ask:

> When your agent is about to do something risky, how do you currently get human approval or takeover?

### First content themes

* “I built a human takeover button for AI agents.”
* “Before your AI agent sends an email, refunds a customer, or updates a CRM, it should ask a human.”
* “Approve, edit, or take over AI agent actions in one API call.”
* “Your AI agent should not need production access to be safe. It needs human checkpoints.”

## 27. Open Questions

* Should public review links exist for reviewers without accounts?
* Should reviewers need to log in before deciding?
* What should the default review link expiration be?
* Should Forsig store full traces, summaries, or only developer-submitted context?
* Should edited actions use a structured JSON editor, text editor, or both?
* Should `needs_more_info` become its own decision type later?
* How long should interventions be retained by default?
* Should agency accounts support multiple client workspaces early?
* Should Slack buttons be built in v1, or should Slack only link to the web review page?
* Which framework integration matters most after generic REST: LangGraph, OpenAI Agents SDK, CrewAI, Vercel AI SDK, or n8n?
* Should pricing be per workspace, per intervention, per reviewer seat, or per agent workflow?

## 28. Final MVP Definition

The MVP is not a full governance platform.

The MVP is not an AI gateway.

The MVP is not an agent framework.

The MVP is:

> A developer calls one API when an AI agent is about to take a risky action. Forsig creates a secure human review page, notifies a reviewer, lets the human approve, reject, edit, instruct, or take over, returns a structured decision to the agent, and stores an audit trail.

That is the wedge.

That is what should be built first.
