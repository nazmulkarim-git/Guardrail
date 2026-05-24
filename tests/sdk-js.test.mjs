import test from "node:test";
import assert from "node:assert/strict";
import {
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
    baseURL: "https://api.forsig.com/v1"
  });
});
