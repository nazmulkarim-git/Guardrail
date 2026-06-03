# Forsig API Reference

Base URL:

```txt
https://www.forsig.com/api/v1
```

Authenticate with:

```http
Authorization: Bearer fsk_test_xxx
```

## Create Escalation

`POST /escalations`

Creates a pending human approval request.

```json
{
  "agent": { "id": "refund-agent", "name": "Refund Agent", "environment": "production" },
  "risk": { "type": "refund_over_limit", "level": "high" },
  "task": {
    "title": "Approve refund for customer #123",
    "proposed_action": "Issue a $500 refund",
    "customer_impact": true
  },
  "context": { "refund_amount": 500 },
  "review": {
    "notify": ["dashboard", "email"],
    "timeout_seconds": 1800,
    "reviewerEmail": "reviewer@example.com",
    "testMode": "manual"
  },
  "callbackUrl": "https://your-app.com/forsig/webhook"
}
```

`review.testMode` can be `manual`, `auto_approve`, `auto_reject`, or `auto_timeout`. Auto modes are for local/beta testing and resolve after the escalation is polled for at least five seconds.

## Get Escalation

`GET /escalations/:id`

Returns the current status and decision when resolved.

## Cancel Escalation

`POST /escalations/:id/cancel`

Cancels a pending escalation.

## Decision

Dashboard reviewers submit decisions through Forsig. Decision statuses are:

- `approved`
- `rejected`
- `edited`
- `context_added`
- `taken_over`
- `needs_more_info`

Expired escalations reject by default.

## Webhooks

If `callbackUrl` is provided, Forsig sends a decision webhook when an escalation is resolved, expired, canceled, or auto-resolved by test mode.

Headers:

```http
x-forsig-event: escalation.resolved
x-forsig-signature: hmac_sha256_body_signature
```

Set `FORSIG_WEBHOOK_SECRET` in production and verify the signature before trusting the payload.

## Slack Notifications

The beta supports Slack through an incoming webhook URL configured as `FORSIG_SLACK_WEBHOOK_URL`. Add `"slack"` to `review.notify` to send a Slack review link. Full Slack OAuth and interactive buttons are planned after the first beta feedback loop.
