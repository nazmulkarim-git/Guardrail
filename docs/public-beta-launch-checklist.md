# Forsig Public Beta Launch Checklist

Use this checklist after deploying the P1 build.

## 1. Database

Run these SQL files in Supabase SQL Editor, in order:

1. `docs/forsig-mvp-schema.sql`
2. `docs/forsig-developer-access-migration.sql`
3. `docs/forsig-p0-mvp-migration.sql`
4. `docs/forsig-p1-launch-migration.sql`

## 2. Vercel Environment Variables

Required:

- `DATABASE_URL`
- `FORSIG_ADMIN_PASSWORD`
- `FORSIG_ADMIN_SESSION_SECRET`
- `RESEND_API_KEY`
- `WAITLIST_FROM_EMAIL`
- `WAITLIST_REPLY_TO`

Recommended for P1:

- `FORSIG_WEBHOOK_SECRET`
- `FORSIG_REVIEWER_EMAIL`
- `FORSIG_SLACK_WEBHOOK_URL`

## 3. Founder Admin Smoke Test

1. Open `/app`.
2. Log in with `FORSIG_ADMIN_PASSWORD`.
3. Open the Waitlist tab and confirm waitlist leads load.
4. Send beta access to one waitlist lead, or manually invite one test developer from Developers.
5. Confirm the developer invite email arrives and the one-time access code is shown to admin.

## 4. Developer Smoke Test

1. Open `/developer`.
2. Enter the invited developer email and access code.
3. Create and confirm a password.
4. Log out, then log back in with email and password.
5. Test **Forgot password** with the same invited email and confirm the temporary password email arrives.
6. Log in with the temporary password and set a new password.
7. Create an agent.
8. Create an API key and copy it.
9. Click **Send test escalation**.
10. Approve, reject, edit, and take over at least one escalation.

## 5. SDK Smoke Test

Use the copied developer API key:

```bash
FORSIG_API_KEY=fsk_test_xxx node examples/refund-agent-node/index.mjs
```

For automated testing without manual review, set `review.testMode` to `auto_approve` in the example payload and use `waitForDecision: true`.

## 6. Webhook Smoke Test

1. Create an escalation with `callbackUrl`.
2. Resolve it in `/developer`.
3. Confirm your receiver gets:
   - `x-forsig-event`
   - `x-forsig-signature`
   - escalation id and decision payload

## 7. Public Beta Boundaries

Say clearly to developers:

- Forsig is private beta software.
- Send only the context needed for human review.
- Avoid secrets, credentials, unnecessary PII, and regulated data.
- Slack support currently uses incoming webhooks; Slack OAuth and interactive buttons are planned.
- Beta access is invite-only. Developers create a password only after entering an admin-issued access code.
