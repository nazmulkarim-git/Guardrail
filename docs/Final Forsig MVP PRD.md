Forsig MVP PRD
1. Product summary

Product name: Forsig
MVP version: v0.1
Positioning: Human approval infrastructure for autonomous AI agents.
Primary user: Developers building production AI agents.
Secondary users: Support leads, operations managers, founders, client reviewers, and internal team members who need to approve risky agent actions.

One-line promise:

Add one API call when your AI agent is about to do something risky. Forsig pauses the agent, asks a human for approval, and returns the decision with an audit trail.

MVP category:

Human-in-the-loop control layer for AI agents.

Do not position the MVP as:

Full AI governance.
Full agent IAM.
Full LLM gateway.
Budget firewall.
Observability platform.
Generic chatbot handoff tool.
Enterprise compliance suite.

Those can come later.

2. Core thesis

Production AI agents will fail at the exact moments where businesses care most: issuing refunds, sending customer emails, changing account data, approving discounts, updating CRM records, canceling subscriptions, triggering payments, modifying documents, or taking irreversible tool actions.

Developers do not want to build their own approval dashboard, email/Slack notification system, decision API, retry logic, audit trail, reviewer UI, timeout handling, and SDK.

Forsig should give them this in one afternoon.

3. MVP objective

The MVP should prove this:

A developer can integrate Forsig into one real agent workflow in under 30 minutes, create a risky-action approval request, pause the agent, let a human approve/reject/edit the action, and resume the agent safely.

That is the whole MVP.

Everything else is secondary.

4. Target customers
Primary: AI automation agencies

They build agents for clients. Clients often ask, “Can we review this before it happens?” Agencies need a reusable approval layer.

Pain: Every client wants approval workflows, but building them repeatedly is annoying.

Willingness to pay: Good, because Forsig saves agency implementation time and reduces client risk.

Primary: AI SaaS teams

These teams are embedding agents into support, sales, operations, onboarding, billing, or internal workflows.

Pain: They want agents to act, but not fully autonomously.

Willingness to pay: Good if the agent touches money, customers, CRM, support tickets, contracts, or production data.

Primary: developers building agents with frameworks

Target developers using LangGraph, CrewAI, AutoGen, OpenAI Agents SDK, n8n, Make, Zapier, custom Python, or custom Node/TypeScript.

Pain: They need a simple API/SDK to pause and resume agent workflows.

Willingness to pay: Moderate at first. They need a free tier and excellent docs.

Secondary: human reviewers

These are not the economic buyer at first, but they must love the product.

Examples:

Support lead approving refunds.
Founder approving outbound sales emails.
Ops manager approving vendor/payment workflows.
Client reviewer approving agency-built automations.
Compliance/admin reviewer approving risky account actions.
5. MVP user stories
Developer user stories

As a developer, I want to:

Sign up and create a workspace.
Create an API key.
Create an agent in Forsig.
Copy a code snippet.
Call forsig.escalate() from my agent.
Send context, risk level, and proposed action.
Choose whether my agent waits synchronously, polls, or receives a webhook.
Receive a structured decision.
Continue, stop, or modify my workflow based on the decision.
See all escalations and decisions in the dashboard.
Reviewer user stories

As a human reviewer, I want to:

Receive an approval request.
Understand what the agent wants to do.
See why the action is risky.
See relevant context without reading raw logs.
Approve, reject, edit, add context, request more info, or take over.
Know that my decision was saved.
Review past decisions later.
Founder/admin user stories

As a founder/admin, I want to:

See which agents are creating approvals.
See pending and resolved escalations.
Know average response time.
Know which risk types happen most often.
Export or inspect audit history later.
Invite teammates as reviewers.

For MVP, admin analytics should be basic. Do not build a complex analytics suite.

6. MVP scope
P0: Must have for launch

This is the real MVP.

1. Landing page

Already mostly done. It should have:

Hero: “Let humans approve, edit, or take over risky AI agent actions.”
One concrete example: refund approval.
CTA: “Get early access” or “Start free.”
Demo section showing approval workflow.
Code snippet showing forsig.escalate().
Pricing placeholder.
Waitlist/signup form.
Basic analytics.
2. Auth and workspace

Required:

Email/password or magic-link login.
Workspace creation.
Single default workspace per user.
Basic roles:
Owner
Admin
Reviewer
Developer

For MVP, do not overbuild RBAC. Basic access control is enough.

3. API keys

Required:

Developer can create a Forsig API key.
Raw key is shown once.
Store only hashed API key.
Allow revoke.
Prefix format:
fsk_test_xxx
fsk_live_xxx

MVP can use only fsk_test_ until production launch.

4. Agents

Required fields:

agent {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description?: string;
  environment: "development" | "staging" | "production";
  defaultReviewerEmails: string[];
  createdAt: Date;
  updatedAt: Date;
}

Developer can:

Create agent.
Edit agent.
Archive agent.
View agent escalations.
Copy integration snippet.

Do not build complicated agent graph visualization.

5. Escalation API

This is the core product.

Endpoint:

POST /v1/escalations
Authorization: Bearer fsk_test_xxx
Content-Type: application/json

Request:

{
  "agent": {
    "id": "refund-agent",
    "name": "Refund Agent",
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
    "allowed_actions": [
      "approve",
      "reject",
      "edit",
      "add_context",
      "take_over",
      "needs_more_info"
    ],
    "notify": ["dashboard", "email"],
    "timeout_seconds": 1800
  }
}

Response:

{
  "id": "esc_abc123",
  "status": "pending",
  "dashboard_url": "https://app.forsig.com/escalations/esc_abc123",
  "created_at": "2026-06-03T10:00:00Z",
  "expires_at": "2026-06-03T10:30:00Z"
}
6. Escalation statuses

Use simple status states:

type EscalationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "edited"
  | "context_added"
  | "taken_over"
  | "needs_more_info"
  | "expired"
  | "canceled";

MVP rule:

If an escalation expires, default to rejected.

That is safer than allowing the risky action to proceed.

7. Decision API

Endpoint:

POST /v1/escalations/:id/decision
Authorization: Bearer reviewer/session auth
Content-Type: application/json

Request:

{
  "status": "edited",
  "instruction": "Approve the refund, but issue store credit instead of cash.",
  "added_context": {
    "reason": "Customer had a similar refund last month."
  }
}

Response:

{
  "id": "esc_abc123",
  "status": "edited",
  "instruction": "Approve the refund, but issue store credit instead of cash.",
  "added_context": {
    "reason": "Customer had a similar refund last month."
  },
  "decided_at": "2026-06-03T10:08:00Z"
}
8. Retrieve escalation

Endpoint:

GET /v1/escalations/:id
Authorization: Bearer fsk_test_xxx

Response:

{
  "id": "esc_abc123",
  "status": "approved",
  "decision": {
    "status": "approved",
    "instruction": "Proceed with the refund.",
    "added_context": null
  }
}

This supports polling.

9. Blocking wait endpoint

For simple integrations, support:

POST /v1/escalations/:id/wait
Authorization: Bearer fsk_test_xxx

Or SDK-level wait:

const decision = await forsig.escalate({
  ...payload,
  waitForDecision: true,
  timeoutSeconds: 1800
});

For MVP, blocking wait can be implemented with short polling behind the SDK. Do not build complex realtime infrastructure first.

10. Dashboard approval inbox

Required pages:

/login
/onboarding
/dashboard
/escalations
/escalations/[id]
/agents
/agents/new
/agents/[id]
/settings/api-keys
/settings/team
/docs

Dashboard home should show:

Pending escalations.
Recently resolved escalations.
Escalations by agent.
Average decision time.
“Create test escalation” button.

Escalation detail page should show:

Agent name.
Workflow.
Run ID.
Risk type.
Risk level.
Risk reason.
Proposed action.
Context JSON in readable format.
Timeline.
Reviewer decision panel.

Decision buttons:

Approve.
Reject.
Edit.
Add context.
Request more info.
Take over.
11. Email notifications

MVP should include email notification before Slack.

Why: email is easier to ship, easier to test, and does not require OAuth complexity.

Email should include:

Agent name.
Risk level.
Proposed action.
CTA: “Review in Forsig.”
Signed review link or login-required link.

For the first private beta, login-required links are safer. Public signed links can come later.

12. JavaScript/TypeScript SDK

Package:

@forsig/sdk

Usage:

import { Forsig } from "@forsig/sdk";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY
});

const decision = await forsig.escalate({
  agent: {
    id: "refund-agent",
    name: "Refund Agent",
    environment: "production"
  },
  run: {
    id: "run_123",
    workflow: "refund-review-flow",
    step: "refund_approval"
  },
  risk: {
    type: "refund_over_limit",
    level: "high",
    reason: "Refund amount exceeds normal policy limit."
  },
  task: {
    title: "Approve refund for customer #123",
    proposedAction: "Issue a $500 refund",
    customerImpact: true
  },
  context: {
    customerTier: "VIP",
    orderValue: 1200,
    refundAmount: 500,
    refundReason: "Product failed twice"
  },
  waitForDecision: true,
  timeoutSeconds: 1800
});

if (decision.status === "approved") {
  await issueRefund();
}

if (decision.status === "edited") {
  await followHumanInstruction(decision.instruction);
}

if (decision.status === "rejected" || decision.status === "taken_over") {
  await stopWorkflow(decision.instruction);
}

SDK must include:

forsig.escalate()
forsig.getEscalation(id)
forsig.cancelEscalation(id)
Error classes
TypeScript types
Timeout handling
Retry handling
Examples

Python SDK can wait until P1 unless your early users are mostly Python developers.

13. Developer docs

Docs must be part of the MVP.

Required pages:

/docs
/docs/quickstart
/docs/api-reference
/docs/sdk/javascript
/docs/examples/refund-agent
/docs/examples/langgraph
/docs/examples/openai-agents
/docs/errors

Docs should answer:

What is Forsig?
When should I call Forsig?
How do I pause my agent?
How do I get a decision?
What happens on timeout?
What data should I send?
What data should I avoid sending?
How do I test locally?
14. Demo workflow

Build a polished demo around one use case:

AI support agent wants to issue a $500 refund. Company policy says refunds over $250 require human approval. Forsig pauses the agent, notifies a reviewer, reviewer edits the action to store credit, and the agent resumes.

This should be both:

A landing-page visual demo.
A real working example in the repo.
P1: Needed for stronger paid beta

Build after P0 works.

Slack notifications

Slack is important, but should not block initial MVP.

Features:

Connect Slack workspace.
Choose channel.
Send escalation message.
Buttons: approve/reject/review.
Deep link to Forsig dashboard.
Save Slack decision into audit trail.
Webhooks

Developers building production workflows will want callbacks.

Endpoint configuration:

{
  "url": "https://example.com/forsig/webhook",
  "secret": "whsec_xxx",
  "events": ["escalation.resolved", "escalation.expired"]
}

Events:

escalation.created
escalation.resolved
escalation.expired
escalation.canceled
Python SDK

Package:

forsig

Example:

from forsig import Forsig

forsig = Forsig(api_key=os.environ["FORSIG_API_KEY"])

decision = forsig.escalate(
    agent={"id": "refund-agent", "name": "Refund Agent"},
    risk={"type": "refund_over_limit", "level": "high"},
    task={"title": "Approve $500 refund", "proposed_action": "Issue refund"},
    context={"refund_amount": 500, "customer_tier": "VIP"},
    wait_for_decision=True,
    timeout_seconds=1800
)
Reviewer assignment

Add:

Default reviewers per agent.
Manual assign/reassign.
Reviewer status: pending, viewed, decided.
Test mode

Developers need to test without bothering real people.

Add:

Test escalation mode.
Auto-approve after 5 seconds.
Auto-reject after 5 seconds.
Simulate timeout.
Seed demo agent.
P2: Do not build before launch

Do not build these before real user validation:

Full LLM gateway.
Budget firewall.
Agent IAM.
MCP gateway.
SOC 2 automation.
Complex RBAC.
Billing.
Organization-wide policy engine.
Model routing.
Prompt-injection classifier.
Full observability platform.
Mobile app.
Browser extension.
Multi-channel notification matrix.
Complex workflow builder.
Zapier/Make/n8n integrations.
Enterprise audit exports.
7. Data model
users
users {
  id: string;
  email: string;
  name?: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
workspaces
workspaces {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
workspace_members
workspace_members {
  id: string;
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "developer" | "reviewer";
  createdAt: Date;
  updatedAt: Date;
}
api_keys
api_keys {
  id: string;
  workspaceId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  lastFour: string;
  status: "active" | "revoked";
  createdByUserId: string;
  createdAt: Date;
  revokedAt?: Date;
}
agents
agents {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description?: string;
  environment: "development" | "staging" | "production";
  defaultReviewerEmails: string[];
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
escalations
escalations {
  id: string;
  workspaceId: string;
  agentId?: string;

  externalAgentId?: string;
  agentName?: string;
  environment?: string;

  runId?: string;
  workflow?: string;
  step?: string;
  attempt?: number;

  riskType: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskReason?: string;

  title: string;
  description?: string;
  proposedAction: string;
  customerImpact: boolean;

  context: jsonb;
  trace?: jsonb;
  modelMetadata?: jsonb;

  allowedActions: string[];
  notifyChannels: string[];

  status: EscalationStatus;

  expiresAt?: Date;
  resolvedAt?: Date;
  canceledAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
decisions
decisions {
  id: string;
  escalationId: string;
  workspaceId: string;

  status:
    | "approved"
    | "rejected"
    | "edited"
    | "context_added"
    | "taken_over"
    | "needs_more_info";

  instruction?: string;
  addedContext?: jsonb;

  reviewerUserId?: string;
  reviewerEmail?: string;
  reviewerChannel: "dashboard" | "email" | "slack" | "api";

  createdAt: Date;
}
notification_attempts
notification_attempts {
  id: string;
  workspaceId: string;
  escalationId: string;
  channel: "email" | "slack";
  recipient: string;
  status: "pending" | "sent" | "failed";
  error?: string;
  createdAt: Date;
  sentAt?: Date;
}
audit_events
audit_events {
  id: string;
  workspaceId: string;
  actorType: "user" | "system" | "api";
  actorUserId?: string;
  eventType: string;
  targetType: string;
  targetId?: string;
  metadata: jsonb;
  createdAt: Date;
}

Required audit events:

workspace.created
api_key.created
api_key.revoked
agent.created
agent.updated
agent.archived
escalation.created
escalation.viewed
escalation.decided
escalation.expired
escalation.canceled
notification.sent
notification.failed
team_member.invited
team_member.role_changed
8. API error format

Use one consistent error shape:

{
  "error": {
    "type": "forsig_validation_error",
    "code": "missing_required_field",
    "message": "task.proposed_action is required.",
    "details": {
      "field": "task.proposed_action"
    }
  }
}

Common errors:

invalid_api_key              401
revoked_api_key              401
workspace_not_found          404
agent_not_found              404
invalid_payload              400
escalation_not_found         404
escalation_already_resolved  409
escalation_expired           409
rate_limited                 429
internal_error               500
9. Security and privacy requirements

P0 security requirements:

Hash API keys.
Never store raw API keys.
Encrypt Slack/email provider secrets if stored.
Store only context the developer intentionally sends.
Do not claim SOC 2, HIPAA, GDPR compliance, or enterprise certifications unless true.
Add private beta warning:
Forsig is in private beta. Do not send highly sensitive regulated data unless you have proper authorization and safeguards.
Add context warning in docs:
Send only the minimum context needed for human review. Avoid secrets, credentials, unnecessary PII, and regulated data.
Audit every decision.
10. UX requirements
Onboarding flow

The first-run flow should be:

Sign up
→ Create workspace
→ Create first agent
→ Create API key
→ Copy SDK snippet
→ Create test escalation
→ Approve it in dashboard
→ See SDK return decision

The activation moment is:

“I created an approval request from code and got a human decision back.”

Dashboard layout

Navigation:

Dashboard
Escalations
Agents
Docs
Settings

Keep it simple.

Do not create 15 dashboard pages in MVP.

Escalation card

Each pending escalation card should show:

[High Risk] Refund Agent
Approve refund for customer #123
Proposed action: Issue $500 refund
Waiting: 6 min
Buttons: Approve / Reject / Review
Escalation detail page

Sections:

Summary.
Proposed action.
Risk reason.
Context.
Agent/run metadata.
Decision panel.
Timeline.
11. Metrics
Activation metrics

Track:

Signup completed.
Workspace created.
Agent created.
API key created.
SDK snippet copied.
Test escalation created.
First real escalation created.
First decision completed.
Usage metrics

Track:

Escalations created.
Escalations resolved.
Escalations expired.
Decision type distribution.
Average decision time.
Agents active.
Workspaces active.
Email notifications sent.
SDK errors.
Validation targets

For MVP validation:

5 teams integrate Forsig into a real workflow.
2 teams say they would pay.
1 team uses it in production or client-facing workflow.
Median time-to-first-escalation under 30 minutes.
At least 20 real escalation events created across all beta users.
12. Pricing for MVP

Do not implement billing immediately. Put pricing on the site to test willingness.

Suggested private beta pricing:

Plan	Price	Included
Free	$0	1 agent, 100 escalations/month, dashboard approvals
Starter	$49/mo	5 agents, 2,000 escalations/month, email notifications
Pro	$199/mo	25 agents, 20,000 escalations/month, Slack/webhooks when available
Enterprise	Custom	SSO, retention, audit exports, self-hosting later

The pricing page can say:

Private beta pricing. Early users get founder pricing.
13. Technical stack

Recommended MVP stack:

Next.js App Router
TypeScript
Tailwind CSS
shadcn/ui
Postgres
Drizzle ORM
Auth.js or Clerk
Resend for email
PostHog for analytics
Sentry for errors
pnpm
Turborepo only if using packages from day one

Suggested repo:

forsig/
  apps/
    web/
      app/
      components/
      lib/
      server/
      emails/
  packages/
    db/
    shared/
    sdk-js/
  examples/
    refund-agent-node/
    langgraph-python/
  docs/
    quickstart.md
    api-reference.md
    sdk-js.md

For the first version, you can keep API routes inside apps/web. You do not need a separate gateway service for the human-approval MVP.

14. Build phases
Phase 1: Product skeleton

Build:

Landing page polish.
Auth.
Workspace.
Dashboard shell.
Agents CRUD.
API key creation/revocation.
Database schema.

Definition of done:

User can sign up, create workspace, create agent, create API key.
Phase 2: Escalation core

Build:

POST /v1/escalations.
GET /v1/escalations/:id.
Dashboard inbox.
Escalation detail page.
Decision creation.
Audit events.

Definition of done:

API can create escalation.
Dashboard shows pending escalation.
Reviewer can approve/reject/edit.
API can retrieve final decision.
Phase 3: SDK and example

Build:

@forsig/sdk.
forsig.escalate().
Blocking wait via polling.
Node refund-agent example.
README quickstart.

Definition of done:

A developer can run one example and see the full approval loop.
Phase 4: Email notifications

Build:

Email notification on escalation creation.
Reviewer link.
Notification attempt logging.
Basic email template.

Definition of done:

Reviewer receives email and can review escalation.
Phase 5: Private beta hardening

Build:

Error handling.
Rate limiting.
Sentry.
Analytics.
Seed demo data.
Empty/loading/error states.
Mobile-friendly approval page.
Docs polish.

Definition of done:

5 external developers can integrate without you manually guiding every step.
15. Final MVP acceptance criteria

Forsig MVP is ready to launch when:

A developer can sign up.
A developer can create a workspace.
A developer can create an agent.
A developer can create an API key.
A developer can copy a working SDK snippet.
A developer can create an escalation from code.
A reviewer can see the escalation in the dashboard.
A reviewer can approve, reject, edit, add context, or take over.
The SDK can return the decision to the agent.
Expired escalations safely reject by default.
Every escalation has an audit timeline.
Email notifications work.
Docs explain integration clearly.
The refund-agent demo works end-to-end.
You can onboard a beta user in under 30 minutes.