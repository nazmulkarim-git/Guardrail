# Forsig

Forsig is the human approval layer for autonomous AI agents.

The public launch surface currently focuses on a private beta waitlist, demo dashboard, referral loop, contact flow, and legal/security pages. The product direction is human approval and escalation for risky agent actions.

## Positioning

Forsig lets AI agents pause before risky actions, ask the right human for approval, and continue safely with a complete audit trail.

Agents call Forsig when they are unsure, stuck, or about to take an action that should not happen without human judgment.

Examples:

- Approving a refund outside normal policy
- Sending an external customer email
- Updating a customer record
- Triggering an internal tool
- Running a risky deployment command
- Handling billing or finance workflow decisions

## Current Launch Scope

- Landing page for the new Forsig direction
- Demo approval dashboard with mock data
- Waitlist email collection
- Referral invite and accept flow
- Optional post-signup qualification form
- Contact founder form
- Privacy, Terms, and Security pages
- JavaScript and Python SDK helpers for the first escalation API
- Password-protected reviewer app at `/app`

## First MVP Backend

The first product slice is intentionally thin:

- `POST /api/v1/escalations` creates a pending human approval request.
- `GET /api/v1/escalations/:id` returns the escalation and latest decision.
- `POST /api/v1/escalations/:id/decision` records approve/reject/edit/context/takeover decisions.
- `/app` provides a private reviewer inbox, escalation detail view, decision panel, audit trail, workspace setup, and beta API key generation.
- `/developer` provides invited developers with workspace setup, agent registration, API key generation, test escalations, decision review, and quickstart docs.
- JavaScript and Python SDKs can create escalations, poll for decisions, and send decisions.

Run these SQL files in Postgres/Supabase before using the product API:

1. `docs/forsig-mvp-schema.sql`
2. `docs/forsig-developer-access-migration.sql`
3. `docs/forsig-p0-mvp-migration.sql`
4. `docs/forsig-p1-launch-migration.sql`

For private beta auth, set `FORSIG_API_KEY` and optionally `FORSIG_DEFAULT_WORKSPACE_ID=workspace_beta`. Later, per-workspace keys can be stored in the `api_keys` table as SHA-256 hashes.

## Not Yet Built

Slack buttons, channel configuration, full user/team accounts, and production account management are not built yet. The current product backend is a private beta approval inbox plus API foundation.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

Python SDK tests:

```bash
PYTHONPATH=packages/sdk-python python -m unittest discover -s packages/sdk-python/tests
```

## Production Notes

Required production services include a Postgres database, Resend for email, and PostHog for analytics.

Important environment variables:

```txt
DATABASE_URL
RESEND_API_KEY
WAITLIST_FROM_EMAIL
WAITLIST_REPLY_TO
WAITLIST_OWNER_EMAIL
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
POSTHOG_KEY
POSTHOG_HOST
REFERRAL_INVITE_SECRET
FORSIG_API_KEY
FORSIG_DEFAULT_WORKSPACE_ID
FORSIG_ADMIN_PASSWORD
FORSIG_ADMIN_SESSION_SECRET
FORSIG_REVIEWER_EMAIL
```
