import test from "node:test";
import assert from "node:assert/strict";
import {
  Forsig,
  createForsigOpenAIClient,
  forsigHeaders,
  newForsigSession,
  parseForsigError
} from "../packages/sdk-js/dist/index.mjs";

test("forsigHeaders maps metadata to x-forsig headers", () => {
  assert.deepEqual(
    forsigHeaders({
      agentId: "agt_123",
      agentInstanceId: "inst_123",
      sessionId: "sess_123",
      externalUserId: "user_123",
      requestId: "req_123",
      metadata: { tier: "pro", empty: null }
    }),
    {
      "x-forsig-agent-id": "agt_123",
      "x-forsig-agent-instance-id": "inst_123",
      "x-forsig-session-id": "sess_123",
      "x-forsig-external-user-id": "user_123",
      "x-forsig-request-id": "req_123",
      "x-forsig-meta-tier": "pro"
    }
  );
});

test("newForsigSession returns a stable prefix", () => {
  assert.match(newForsigSession(), /^sess_[a-zA-Z0-9_]+$/);
});

test("parseForsigError identifies Forsig approval errors", () => {
  const parsed = parseForsigError({
    status: 409,
    error: {
      type: "forsig_policy_error",
      code: "approval_required",
      message: "Human approval is required."
    }
  });
  assert.equal(parsed.isForsigError, true);
  assert.equal(parsed.status, 409);
  assert.equal(parsed.code, "approval_required");
});

test("createForsigOpenAIClient returns config without optional OpenAI class", () => {
  assert.deepEqual(createForsigOpenAIClient({ apiKey: "fsk_test_123" }), {
    apiKey: "fsk_test_123",
    baseURL: "https://www.forsig.com/api/v1"
  });
});

test("Forsig client creates escalations with bearer auth", async () => {
  const calls = [];
  const client = new Forsig({
    apiKey: "fsk_test_123",
    baseURL: "https://example.test",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          escalation: { id: "esc_123", status: "pending" }
        })
      };
    }
  });

  const escalation = await client.escalate({
    agent: "refund-agent",
    task: "Approve refund",
    risk: { type: "refund_over_limit", level: "high" },
    proposedAction: "Issue $500 refund"
  });

  assert.equal(escalation.id, "esc_123");
  assert.equal(calls[0].url, "https://example.test/api/v1/escalations");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer fsk_test_123");
  assert.equal(JSON.parse(calls[0].init.body).agent, "refund-agent");
});

test("Forsig client returns shadow escalation without polling", async () => {
  const calls = [];
  const client = new Forsig({
    apiKey: "fsk_test_123",
    baseURL: "https://example.test",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          escalation: { id: "esc_shadow", status: "shadow_logged", mode: "shadow", wouldHaveEscalated: true }
        })
      };
    }
  });

  const escalation = await client.escalate({
    mode: "shadow",
    agent: "refund-agent",
    task: "Approve refund",
    risk: "refund_over_threshold",
    proposedAction: "Issue refund",
    waitForDecision: true
  });

  assert.equal(escalation.status, "shadow_logged");
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].init.body).mode, "shadow");
});

test("Forsig client supports baseUrl alias and cancellation", async () => {
  const calls = [];
  const client = new Forsig({
    apiKey: "fsk_test_123",
    baseUrl: "https://forsig.local/",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          escalation: { id: "esc_123", status: "canceled" }
        })
      };
    }
  });

  const escalation = await client.cancelEscalation("esc_123");

  assert.equal(escalation.status, "canceled");
  assert.equal(calls[0].url, "https://forsig.local/api/v1/escalations/esc_123/cancel");
  assert.equal(calls[0].init.method, "POST");
});
