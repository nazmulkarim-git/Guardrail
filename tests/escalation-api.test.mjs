import test from "node:test";
import assert from "node:assert/strict";
import { hashApiKey, parseBearer } from "../server/api-routes/_forsig-core.js";
import { validateEscalationPayload } from "../server/api-routes/v1/escalations.js";
import publicDecisionHandler from "../server/api-routes/v1/escalations/[id]/decision.js";

test("validateEscalationPayload accepts compact JavaScript input", () => {
  const parsed = validateEscalationPayload({
    agent: "refund-agent",
    task: "Approve refund for customer #123",
    risk: { type: "refund_over_limit", level: "high" },
    proposedAction: "Issue $500 refund"
  });

  assert.equal(parsed.valid, true);
  assert.equal(parsed.agent.id, "refund-agent");
  assert.equal(parsed.task.proposedAction, "Issue $500 refund");
  assert.equal(parsed.risk.type, "refund_over_limit");
});

test("validateEscalationPayload accepts shadow mode", () => {
  const parsed = validateEscalationPayload({
    mode: "shadow",
    agent: "refund-agent",
    task: "Approve refund",
    risk: "refund_over_threshold",
    proposedAction: "Issue refund"
  });

  assert.equal(parsed.valid, true);
  assert.equal(parsed.mode, "shadow");
});

test("validateEscalationPayload rejects unknown mode", () => {
  const parsed = validateEscalationPayload({
    mode: "maybe",
    agent: "refund-agent",
    task: "Approve refund",
    risk: "refund_over_threshold",
    proposedAction: "Issue refund"
  });

  assert.equal(parsed.valid, false);
  assert.match(parsed.errors.join(" "), /mode must be shadow or active/);
});

test("validateEscalationPayload accepts Python-style proposed_action", () => {
  const parsed = validateEscalationPayload({
    agent: { id: "sales-agent", name: "Sales Agent" },
    task: { title: "Approve outbound offer" },
    risk: "external_message",
    proposed_action: "Send 30% discount email"
  });

  assert.equal(parsed.valid, true);
  assert.equal(parsed.agent.name, "Sales Agent");
  assert.equal(parsed.task.proposedAction, "Send 30% discount email");
});

test("validateEscalationPayload reports missing required fields", () => {
  const parsed = validateEscalationPayload({});
  assert.equal(parsed.valid, false);
  assert.deepEqual(parsed.errors, [
    "agent is required.",
    "task title is required.",
    "risk type is required.",
    "proposedAction is required."
  ]);
});

test("agent API credentials cannot grant reviewer decisions", async () => {
  let statusCode = null;
  let payload = null;

  const req = { method: "POST" };
  const res = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    }
  };

  await publicDecisionHandler(req, res);

  assert.equal(statusCode, 403);
  assert.equal(payload?.ok, false);
  assert.equal(payload?.error?.code, "reviewer_auth_required");
});

test("parseBearer extracts bearer token", () => {
  assert.equal(parseBearer({ headers: { authorization: "Bearer fsk_test_123" } }), "fsk_test_123");
});

test("hashApiKey is deterministic", () => {
  assert.equal(hashApiKey("fsk_test_123"), hashApiKey("fsk_test_123"));
  assert.notEqual(hashApiKey("fsk_test_123"), "fsk_test_123");
});
