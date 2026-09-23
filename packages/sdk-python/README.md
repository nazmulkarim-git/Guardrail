# Forsig Python SDK

Official Python SDK for Forsig, the human-approval checkpoint for autonomous AI agents.

Use it when your agent is about to take a risky action, such as issuing a refund, sending an external email, deploying code, changing production data, or spending money through a tool call.

## Install

```bash
pip install forsig
```

## Quickstart

```python
import os
from forsig import Forsig

forsig = Forsig(api_key=os.environ["FORSIG_API_KEY"])

decision = forsig.escalate(
    agent={
        "name": "refund-agent",
        "version": "1.0.0",
        "environment": "production",
    },
    workflow="refund-review",
    step="refund_over_limit",
    task={
        "title": "Approve refund for customer #123",
        "description": "The agent wants to issue a $500 refund.",
        "customerImpact": True,
    },
    risk={
        "type": "refund_over_limit",
        "level": "high",
        "reason": "Refund exceeds the normal approval limit.",
    },
    proposedAction="Issue a $500 refund to customer #123.",
    context={
        "amount": 500,
        "currency": "USD",
        "customerTier": "VIP",
    },
    wait_for_decision=True,
)

if decision.get("status") == "approved":
    # Continue the action.
    pass
```

## Shadow mode

Shadow mode logs what Forsig would have escalated without blocking your agent.

```python
forsig.escalate(
    mode="shadow",
    agent="sales-agent",
    task="Review outbound discount email",
    risk="external_email",
    proposedAction="Send custom offer email to a prospect.",
)
```

## Decisions

If you do not want the SDK to wait, create an escalation and fetch it later.

```python
escalation = forsig.escalate(
    agent="deployment-agent",
    task="Review production migration",
    risk={"type": "production_change", "level": "critical"},
    proposedAction="Run a migration touching billing records.",
)

latest = forsig.get_escalation(escalation["id"])
```

## Metadata headers

Use `forsig_headers` when you proxy model or tool requests through your own infra and want consistent trace metadata.

```python
from forsig import forsig_headers, new_forsig_session

headers = forsig_headers(
    agent_id="refund-agent",
    session_id=new_forsig_session(),
    external_user_id="customer_123",
    metadata={"plan": "enterprise"},
)
```

## Safety note

Send the minimum context a reviewer needs. Do not send API keys, passwords, private tokens, full payment records, or unnecessary customer data.

## API surface

- `Forsig(api_key, base_url?, http_client?)`
- `forsig.escalate(**payload)`
- `forsig.get_escalation(escalation_id)`
- `forsig.cancel_escalation(escalation_id)`
- `forsig.wait_for_decision(escalation_id, poll_interval_seconds?, timeout_seconds?)`
- `forsig_headers(...)`
- `new_forsig_session(prefix?)`
- `parse_forsig_error(error)`

## Publish checklist

Before publishing, choose the license you want and replace `UNLICENSED` in `pyproject.toml` if the SDK should be open source.

```bash
python -m build
python -m twine check dist/*
python -m twine upload dist/*
```
