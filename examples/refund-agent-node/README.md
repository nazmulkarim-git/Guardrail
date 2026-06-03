# Forsig Refund Agent Example

This example simulates an AI support agent that needs approval before issuing a `$500` refund.

## Setup

Create an agent in Forsig with slug:

```txt
refund-agent
```

Create an API key in `/developer`, then run:

```bash
npm install
FORSIG_API_KEY=fsk_test_xxx FORSIG_BASE_URL=https://www.forsig.com npm start
```

Open Forsig, review the pending escalation, and send a decision. The script polls until the decision is available.
