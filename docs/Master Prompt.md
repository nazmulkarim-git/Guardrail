You are a senior full-stack engineer and product-minded technical cofounder. Build the Forsig v0.1 MVP.

Product:
Forsig is human-approval infrastructure for autonomous AI agents. Developers call Forsig when an AI agent is about to take a risky action. Forsig creates an escalation, pauses the agent, notifies a human reviewer, collects a decision, stores an audit trail, and returns the decision so the agent can continue, stop, or change its action.

Primary MVP workflow:
Developer integrates SDK → agent calls forsig.escalate() → Forsig creates pending escalation → reviewer sees it in dashboard/email → reviewer approves/rejects/edits/adds context/takes over → SDK returns structured decision → agent resumes safely.

Build only the MVP. Do not build a full AI governance platform, LLM gateway, billing system, SOC2 system, MCP gateway, budget firewall, observability product, workflow builder, or complex RBAC.

Tech stack:
- TypeScript
- Next.js App Router
- Tailwind CSS
- shadcn/ui
- Postgres
- Drizzle ORM
- Auth.js or Clerk; choose the fastest reliable option
- Resend for email notifications
- PostHog for analytics if simple
- Sentry if simple
- pnpm
- Package for JS SDK: packages/sdk-js

Repo structure:
forsig/
  apps/web
  packages/db
  packages/shared
  packages/sdk-js
  examples/refund-agent-node
  docs

Required app pages:
- /
- /login
- /onboarding
- /dashboard
- /escalations
- /escalations/[id]
- /agents
- /agents/new
- /agents/[id]
- /settings/api-keys
- /settings/team
- /docs

Core database tables:
- users
- workspaces
- workspace_members
- api_keys
- agents
- escalations
- decisions
- notification_attempts
- audit_events

API requirements:
1. POST /api/v1/escalations
   - Auth with Bearer fsk_test_xxx
   - Validate payload with Zod
   - Create escalation
   - Store context JSON
   - Create audit event
   - Send email notification if configured
   - Return id, status, dashboard_url, created_at, expires_at

2. GET /api/v1/escalations/:id
   - Auth with API key
   - Return escalation status and decision if resolved

3. POST /api/v1/escalations/:id/decision
   - Auth with user session
   - Accept status: approved, rejected, edited, context_added, taken_over, needs_more_info
   - Save decision
   - Mark escalation resolved
   - Create audit event

4. POST /api/v1/escalations/:id/cancel
   - Auth with API key or user session
   - Mark escalation canceled if still pending

5. POST /api/v1/escalations/:id/wait
   - Can be implemented as SDK polling instead of true long-held request
   - Safe timeout: expired escalation becomes rejected

SDK requirements:
Build @forsig/sdk with:
- new Forsig({ apiKey, baseUrl })
- forsig.escalate(payload, options)
- forsig.getEscalation(id)
- forsig.cancelEscalation(id)
- polling wait support
- timeout support
- TypeScript types
- useful errors

Example SDK usage:
const decision = await forsig.escalate({
  agent: { id: "refund-agent", name: "Refund Agent", environment: "production" },
  run: { id: "run_123", workflow: "refund-review-flow", step: "refund_approval" },
  risk: { type: "refund_over_limit", level: "high", reason: "Refund exceeds policy limit." },
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

Dashboard requirements:
- Clean dark SaaS UI matching Forsig landing page style.
- Dashboard shows pending escalations, resolved escalations, average decision time, and active agents.
- Escalation list cards show risk level, agent, title, proposed action, waiting time, and status.
- Escalation detail page shows summary, risk reason, proposed action, context JSON, metadata, decision panel, and timeline.
- Decision panel supports approve, reject, edit, add context, take over, request more info.
- Agents page supports create/edit/archive.
- API keys page supports create/revoke. Raw key shown once only.

Security requirements:
- Hash Forsig API keys. Never store raw API keys.
- Do not store secrets in logs.
- Store only context sent by developer.
- Add private beta warning in docs: do not send highly sensitive regulated data.
- Add audit event for every important action.
- Validate all inputs with Zod.
- Use consistent error shape.

Email requirements:
- Use Resend.
- On escalation creation, email default reviewer emails.
- Email includes agent name, risk level, proposed action, and review link.
- Log notification attempt.

Demo requirement:
Build examples/refund-agent-node that:
1. Creates a simulated refund approval escalation.
2. Waits for decision.
3. Prints whether refund is approved, rejected, edited, or taken over.
4. Includes clear README instructions.

Docs requirement:
Create docs:
- quickstart.md
- api-reference.md
- sdk-js.md
- errors.md
- refund-agent-example.md

Development process:
1. First inspect the repo structure and existing package files.
2. Create a concise implementation plan before editing.
3. Implement in small working increments.
4. After each phase, run typecheck, lint, and tests if available.
5. Do not leave broken builds.
6. Prefer simple, production-readable code over clever abstractions.
7. Add TODO comments only for intentionally deferred post-MVP features.
8. At the end, summarize what was built, what commands were run, and what remains.

Definition of done:
- Signup/login works.
- Workspace creation works.
- Agent creation works.
- API key creation/revocation works.
- POST /api/v1/escalations works.
- Dashboard inbox works.
- Escalation decision works.
- SDK can create escalation and wait for decision.
- Email notification works.
- Refund-agent demo works end-to-end.
- README explains local setup.