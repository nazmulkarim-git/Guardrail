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
    "timeout_seconds": 1800
  }
}
```

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
