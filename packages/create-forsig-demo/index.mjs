#!/usr/bin/env node

import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const target = join(process.cwd(), "forsig-demo.mjs");

if (existsSync(target)) {
  console.error("forsig-demo.mjs already exists. Rename it or run this command in a clean folder.");
  process.exit(1);
}

writeFileSync(target, `const baseUrl = process.env.FORSIG_BASE_URL || "https://www.forsig.com";
const apiKey = process.env.FORSIG_API_KEY;

if (!apiKey) {
  throw new Error("Set FORSIG_API_KEY before running this demo.");
}

async function forsig(path, options = {}) {
  const response = await fetch(\`\${baseUrl}\${path}\`, {
    ...options,
    headers: {
      "authorization": \`Bearer \${apiKey}\`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error?.message || "Forsig request failed");
  }
  return data;
}

const created = await forsig("/api/v1/escalations", {
  method: "POST",
  body: JSON.stringify({
    agent: { id: "refund-agent", name: "Refund Agent", environment: "development" },
    workflow: "refund-review-flow",
    step: "refund-over-limit",
    risk: { type: "refund_over_limit", level: "high", reason: "Refund amount is above policy." },
    task: {
      title: "Approve refund for customer #123",
      description: "The agent wants to issue a $500 refund to a VIP customer.",
      proposedAction: "Issue a $500 refund",
      customerImpact: true
    },
    context: {
      refundAmount: 500,
      customerTier: "VIP"
    },
    review: { notify: ["dashboard", "email"] },
    timeoutSeconds: 900
  })
});

console.log("Forsig approval created:");
console.log(created.dashboardUrl || created.dashboard_url || \`\${baseUrl}/developer?esc=\${created.id}\`);
console.log("Approve, reject, edit, or take over in Forsig. Polling for a decision...");

while (true) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const result = await forsig(\`/api/v1/escalations/\${created.id}\`);
  if (result.escalation.status !== "pending") {
    console.log("Final decision returned to agent:");
    console.log(JSON.stringify(result.escalation.decision || result.escalation, null, 2));
    break;
  }
  console.log("Current Forsig status:", result.escalation.status);
}
`);

console.log("Created forsig-demo.mjs");
console.log("Run it with:");
console.log("  FORSIG_API_KEY=fsk_test_xxx node forsig-demo.mjs");
