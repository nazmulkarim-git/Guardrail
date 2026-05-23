# Forsig

Forsig is a budget firewall, audit log, and kill switch for AI agents.

This repository starts the v0.1 MVP with:

- Premium dark landing page and waitlist
- Local waitlist API with detailed analytics capture
- Resend confirmation email hook
- PostHog-ready frontend event hooks
- Fast agent dashboard prototype
- JavaScript SDK helpers
- Python SDK helpers
- OpenAI-compatible gateway contract skeleton

## Run Locally

```sh
npm run dev
```

Open `http://localhost:3000`.

The local server serves:

- `/` landing page
- `/dashboard` dashboard prototype
- `/thanks` waitlist thank-you page
- `/api/waitlist` waitlist API

Waitlist submissions are stored at `data/waitlist-leads.json`.

## Optional Environment

```env
RESEND_API_KEY=
WAITLIST_FROM_EMAIL=Forsig <hello@forsig.com>
WAITLIST_REPLY_TO=hello@forsig.com
POSTHOG_KEY=
POSTHOG_HOST=https://app.posthog.com
```

If `RESEND_API_KEY` is missing, the API records that email was skipped locally instead of failing the signup.

## SDK Promise

Developers can add Forsig in seconds by changing the OpenAI-compatible `baseURL`, swapping in a Forsig virtual key, and optionally attaching SDK metadata headers.

JavaScript:

```ts
import OpenAI from "openai";
import { forsigHeaders, newForsigSession } from "@forsig/sdk";

const client = new OpenAI({
  apiKey: process.env.FORSIG_API_KEY,
  baseURL: "https://gateway.forsig.com/v1",
});

await client.chat.completions.create(
  {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello" }],
  },
  {
    headers: forsigHeaders({
      sessionId: newForsigSession(),
      externalUserId: "user_123",
    }),
  }
);
```

Python:

```py
import os
from openai import OpenAI
from forsig import forsig_headers, new_forsig_session

client = OpenAI(
    api_key=os.environ["FORSIG_API_KEY"],
    base_url="https://gateway.forsig.com/v1",
)

client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
    extra_headers=forsig_headers(
        session_id=new_forsig_session(),
        external_user_id="user_123",
    ),
)
```

## Tests

```sh
npm test
python -m unittest discover -s packages/sdk-python/tests
```
