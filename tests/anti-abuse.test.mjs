import assert from "node:assert/strict";
import test from "node:test";

import { analyzePublicSubmission, isLikelyRandomToken } from "../server/api-routes/_anti-abuse.js";

function req(userAgent = "Mozilla/5.0 Chrome/126 Safari/537.36") {
  return {
    headers: {
      "user-agent": userAgent,
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}`
    },
    socket: {}
  };
}

test("detects random-looking bot tokens", () => {
  assert.equal(isLikelyRandomToken("AiDnoQqvYBITfrkEyzwmq"), true);
  assert.equal(isLikelyRandomToken("Nazmul Karim"), false);
});

test("suppresses screenshot-style contact spam", () => {
  const result = analyzePublicSubmission(req(), {
    name: "AiDnoQqvYBITfrkEyzwmq",
    email: "n.aharts12.34@gmail.com",
    company: "kEKCLblqLwbOEKIIEaV",
    role: "Product Manager",
    message: "YUsLAYMIHxBRyZPbhj",
    formStartedAt: String(Date.now() - 10_000)
  }, { type: "contact" });

  assert.equal(result.blocked, true);
  assert.match(result.reasons.join(","), /random_name|meaningless_message/);
});

test("allows a real contact message", () => {
  const result = analyzePublicSubmission(req(), {
    name: "Nazmul Karim",
    email: "founder@example.com",
    company: "Forsig",
    role: "Founder",
    message: "I am testing a refund approval workflow and want to join the private beta.",
    formStartedAt: String(Date.now() - 10_000)
  }, { type: "contact" });

  assert.equal(result.blocked, false);
});

test("suppresses waitlist honeypot submissions", () => {
  const result = analyzePublicSubmission(req(), {
    email: "person@example.com",
    website: "https://spam.example",
    formStartedAt: String(Date.now() - 10_000)
  }, { type: "waitlist" });

  assert.equal(result.blocked, true);
  assert.deepEqual(result.reasons.includes("honeypot"), true);
});
