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
- JavaScript and Python SDK package placeholders from the earlier prototype

## Not Yet Built

The full product backend for escalation requests, reviewer inboxes, channel integrations, and agent resume endpoints has not been built yet. The current work is the waitlist-facing soft-launch site.

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
```
