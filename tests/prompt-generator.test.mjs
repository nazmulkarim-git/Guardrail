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
