import test from "node:test";
import assert from "node:assert/strict";
import { generateIntegrationPrompt, parsePolicyGoal } from "../apps/web/prompt-generator.mjs";

test("parsePolicyGoal infers refund threshold and currency", () => {
  const policy = parsePolicyGoal("refund above 500 USD");
  assert.equal(policy.action, "refund");
  assert.equal(policy.operator, ">");
  assert.equal(policy.threshold, 500);
  assert.equal(policy.currency, "USD");
  assert.equal(policy.riskType, "refund_over_threshold");
  assert.equal(policy.mode, "shadow");
});

test("generated refund prompt includes launch-quality safety requirements", () => {
  const prompt = generateIntegrationPrompt({ goal: "refund above 500 USD", targetTool: "codex" });
  assert.match(prompt, /greater than 500 USD/);
  assert.match(prompt, /exactly 500 USD or less/);
  assert.match(prompt, /500 USD equals 50000 cents/);
  assert.match(prompt, /Default mode: shadow/);
  assert.match(prompt, /active: wait for human approval/);
  assert.match(prompt, /stripe\.refunds\.create/);
  assert.match(prompt, /final irreversible execution boundary/);
  assert.match(prompt, /edited\/context_added\/needs_more_info: only continue/);
  assert.match(prompt, /smallest safe change set/i);
});

test("generated prompt supports target tool variants", () => {
  assert.match(generateIntegrationPrompt({ goal: "refund above 500 USD", targetTool: "cursor" }), /Search the codebase/);
  assert.match(generateIntegrationPrompt({ goal: "refund above 500 USD", targetTool: "claude" }), /Inspect first/);
  assert.match(generateIntegrationPrompt({ goal: "refund above 500 USD", targetTool: "codex" }), /Implement the requested change/);
});

test("generated prompt includes framework install and reviewer routing", () => {
  const prompt = generateIntegrationPrompt({
    goal: "production deployment approval",
    framework: "Python agent",
    mode: "active",
    reviewerEmails: "ops@example.com",
    targetTool: "codex"
  });
  assert.match(prompt, /pip install forsig-sdk/);
  assert.match(prompt, /Default mode: active/);
  assert.match(prompt, /Default reviewer emails: ops@example\.com/);
  assert.match(prompt, /Python: prefer a tiny Forsig helper or decorator/);
});

test("generated prompt supports paid tool spend policies", () => {
  const prompt = generateIntegrationPrompt({ goal: "paid external tool calls over budget", framework: "Node / TypeScript agent" });
  assert.match(prompt, /paid external tool calls/i);
  assert.match(prompt, /tool_spend_limit/);
  assert.match(prompt, /npm install @forsig\/sdk/);
});
