# Forsig SDK Publishing Guide

This repo contains two public SDK packages:

- TypeScript: `packages/sdk-js`, published as `@forsig/sdk`
- Python: `packages/sdk-python`, published as `forsig`

## Before publishing

Choose the license before launch. Both packages currently use `UNLICENSED` so you do not accidentally publish under the wrong legal terms.

Recommended launch path:

1. Confirm package names are available on npm and PyPI.
2. Set the first public version, for example `0.1.0`.
3. Publish from a clean git tree.
4. Install each package into a fresh test app and create one real escalation.

## TypeScript SDK

```bash
cd packages/sdk-js
npm pack --dry-run
npm publish --access public
```

After publishing:

```bash
mkdir forsig-js-smoke
cd forsig-js-smoke
npm init -y
npm install @forsig/sdk
```

Smoke test:

```js
import { Forsig } from "@forsig/sdk";

const forsig = new Forsig({ apiKey: process.env.FORSIG_API_KEY });

const escalation = await forsig.escalate({
  agent: "smoke-test-agent",
  task: "Smoke test escalation",
  risk: { type: "sdk_smoke_test", level: "low" },
  proposedAction: "Confirm the published SDK can reach Forsig."
});

console.log(escalation.id);
```

## Python SDK

The local Codex runtime does not include `build`, so use either your normal Python environment or install the publishing tools first:

```bash
python -m pip install --upgrade build twine
cd packages/sdk-python
python -m build
python -m twine check dist/*
python -m twine upload dist/*
```

If you are using the bundled local runtime without network access, this repository was verified with:

```bash
python -m pip wheel . --no-deps --no-build-isolation -w dist
```

After publishing:

```bash
mkdir forsig-python-smoke
cd forsig-python-smoke
python -m venv .venv
.venv\Scripts\activate
pip install forsig
```

Smoke test:

```python
import os
from forsig import Forsig

forsig = Forsig(api_key=os.environ["FORSIG_API_KEY"])

escalation = forsig.escalate(
    agent="smoke-test-agent",
    task="Smoke test escalation",
    risk={"type": "sdk_smoke_test", "level": "low"},
    proposedAction="Confirm the published SDK can reach Forsig.",
)

print(escalation["id"])
```

## Release notes template

```text
Forsig SDK v0.1.0

- Create human-approval escalations.
- Poll or wait for decisions.
- Send approve/reject/edit/take-over decisions.
- Run shadow-mode simulations.
- Add trace headers for agent sessions and metadata.
```
