# Forsig 30-Day Marketing Plan

## Goal

Build attention, collect qualified waitlist leads, and find the first 5 teams willing to integrate Forsig into a real AI agent workflow.

The goal is not broad awareness. The goal is qualified conversations with builders who have risky agent actions today or expect them soon.

## Core Message

Forsig is the human approval layer for autonomous AI agents.

Use this short pitch:

> AI agents are starting to send emails, approve refunds, update records, and run tools. Forsig lets agents pause before risky actions, ask the right human, and resume with a full audit trail.

## Target Audience

- AI automation agencies building agents for clients.
- Small AI SaaS teams shipping support, sales, operations, coding, or finance agents.
- Developers using LangGraph, CrewAI, OpenAI Agents SDK, Vercel AI SDK, n8n, Make, Zapier, or custom agent workflows.
- Founders/CTOs who want agents in production but do not fully trust autonomous actions yet.

## Platforms

- X
- LinkedIn
- Indie Hackers
- Hacker News: only when you have something useful to show, not as a generic launch
- Reddit: r/LocalLLaMA, r/SaaS, r/ArtificialInteligence, r/Entrepreneur, r/SideProject, r/AI_Agents if rules allow
- Discord/Slack communities for AI builders, LangGraph, CrewAI, Vercel AI, n8n, automation agencies
- Direct outreach to AI agencies and founders building agent products

## Week 1: Soft Launch And Conversations

### Objective

Get the first 50-100 waitlist signups and 10 real conversations.

### Actions

- Post launch note on X and LinkedIn.
- DM 30 AI builders/agencies with a short personal message.
- Share in 3-5 small communities where self-promotion is allowed.
- Ask every signup to reply with what their agent does.
- Track which use cases appear most: refund approval, outbound email, CRM updates, deployment actions, billing/finance.

### Content To Post

Post 1:

> I’m building Forsig: human approval for autonomous AI agents.
>
> If your agent is about to send an external email, approve a refund, update a customer record, or run a risky tool, it should be able to pause and ask a human first.
>
> Private beta: https://forsig.com

Post 2:

> Most agent failures do not need another dashboard.
>
> They need a human decision at the right moment.
>
> Forsig lets agents pause, ask, receive approve/reject/edit/takeover decisions, and continue with an audit trail.

Post 3:

> Question for AI agent builders:
>
> What action would you never let your agent do without human approval?
>
> Refunds? External emails? CRM updates? Deployments? Billing actions?
>
> I’m using these answers to shape Forsig’s first beta.

### Success Criteria

- 50+ waitlist signups.
- 10 conversations.
- 3 people willing to test the first API.

## Week 2: Use-Case Proof

### Objective

Make the problem concrete and find the first narrow workflow.

### Actions

- Publish one short use-case thread per day.
- Ask waitlist users one question: "Where should your agent ask for approval?"
- Create a simple Loom or GIF showing the current demo.
- DM agency founders and ask whether client agents need human approval.

### Content Themes

- Support agent asks before refund.
- Sales agent asks before sending a custom discount.
- Ops agent asks before changing customer records.
- Coding agent asks before production migration.
- Finance agent asks before invoice/payment action.

### Success Criteria

- 150+ total waitlist signups.
- 5 people who describe a real workflow.
- Pick the first workflow to build around.

## Week 3: Developer Preview

### Objective

Show the SDK/API shape and recruit hands-on testers.

### Actions

- Share the API snippet publicly.
- Post a short "how it works" diagram.
- Offer to help 5 builders add Forsig to one workflow.
- Create a lightweight "founding beta" invite list.

### Content To Post

> The Forsig API shape I’m testing:
>
> ```ts
> const decision = await forsig.escalate({
>   agent: "refund-agent",
>   task: "Approve refund for customer #123",
>   risk: { type: "refund_over_limit", level: "high" },
>   proposedAction: "Issue $500 refund",
>   waitForDecision: true
> });
> ```
>
> The agent pauses. A human approves/rejects/edits. The agent resumes.

### Success Criteria

- 250+ waitlist signups.
- 5 developer preview calls.
- 2 users agree to integrate into a real workflow.

## Week 4: Build In Public And Beta Cohort

### Objective

Convert interest into actual beta usage.

### Actions

- Invite the first 5-10 builders manually.
- Build based on their workflow, not abstract features.
- Publish weekly progress post.
- Share lessons from users without exposing private details.
- Ask each beta user whether they would pay after integration.

### Success Criteria

- 5 teams actively testing or scheduled.
- 2 teams say they would pay.
- Clear top requested channel: email, Slack, Discord, WhatsApp, or Teams.

## Daily Operating Rhythm

- 1 public post per day on X or LinkedIn.
- 5 thoughtful replies to other AI agent builders.
- 5 direct messages to relevant builders/agencies.
- 1 waitlist review.
- 1 short note in a founder log: what people asked for, what confused them, what scared them.

## What Not To Do Yet

- Do not run paid ads.
- Do not do Product Hunt yet.
- Do not overbuild enterprise features.
- Do not market as a generic AI safety platform.
- Do not chase every integration before one workflow works.

## The 30-Day Win

Forsig wins this month if 5 teams say:

> Yes, I want my agent to call Forsig before this risky action.

