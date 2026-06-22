# Forsig Refund Agent Example

This example simulates an AI support agent that needs human approval before issuing a `$500` refund. It creates a real Forsig escalation, prints the dashboard URL, polls for a decision, and then returns the structured decision your agent would branch on.

## Setup

Create an API key in `/developer`. Forsig auto-creates a starter agent named `Refund Agent`; you can also create one manually with slug:

```txt
refund-agent
```

Then run:

```bash
npm install
FORSIG_API_KEY=fsk_test_xxx FORSIG_BASE_URL=https://www.forsig.com npm start
```

Open Forsig, review the pending escalation, and send a decision. The script polls until the decision is available.

## Safety rule

Send only the context needed for review. Do not send API keys, passwords, full payment details, or unnecessary personal data.
