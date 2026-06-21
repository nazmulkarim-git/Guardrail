import unittest

from forsig import (
    Forsig,
    create_forsig_openai_client,
    forsig_headers,
    new_forsig_session,
    parse_forsig_error,
)


class ForsigSdkTests(unittest.TestCase):
    def test_headers(self):
        headers = forsig_headers(
            agent_id="agt_123",
            agent_instance_id="inst_123",
            session_id="sess_123",
            external_user_id="user_123",
            request_id="req_123",
            metadata={"tier": "pro", "empty": None},
        )
        self.assertEqual(headers["x-forsig-agent-id"], "agt_123")
        self.assertEqual(headers["x-forsig-agent-instance-id"], "inst_123")
        self.assertEqual(headers["x-forsig-session-id"], "sess_123")
        self.assertEqual(headers["x-forsig-external-user-id"], "user_123")
        self.assertEqual(headers["x-forsig-request-id"], "req_123")
        self.assertEqual(headers["x-forsig-meta-tier"], "pro")
        self.assertNotIn("x-forsig-meta-empty", headers)

    def test_session_prefix(self):
        self.assertTrue(new_forsig_session().startswith("sess_"))

    def test_error_parser(self):
        parsed = parse_forsig_error(
            {
                "status": 402,
                "error": {
                    "type": "forsig_policy_error",
                    "code": "approval_required",
                    "message": "Human approval is required.",
                },
            }
        )
        self.assertTrue(parsed["is_forsig_error"])
        self.assertEqual(parsed["code"], "approval_required")

    def test_openai_client_config_without_dependency(self):
        client = create_forsig_openai_client("fsk_test_123")
        self.assertEqual(client["api_key"], "fsk_test_123")
        self.assertEqual(client["base_url"], "https://www.forsig.com/api/v1")

    def test_client_creates_escalation_with_bearer_auth(self):
        calls = []

        def http_client(**kwargs):
            calls.append(kwargs)
            return {"ok": True, "escalation": {"id": "esc_123", "status": "pending"}}

        client = Forsig(api_key="fsk_test_123", base_url="https://example.test", http_client=http_client)
        escalation = client.escalate(
            agent="refund-agent",
            task="Approve refund",
            risk={"type": "refund_over_limit", "level": "high"},
            proposed_action="Issue $500 refund",
        )

        self.assertEqual(escalation["id"], "esc_123")
        self.assertEqual(calls[0]["method"], "POST")
        self.assertEqual(calls[0]["url"], "https://example.test/api/v1/escalations")
        self.assertEqual(calls[0]["api_key"], "fsk_test_123")
        self.assertEqual(calls[0]["payload"]["agent"], "refund-agent")

    def test_client_sends_decision(self):
        calls = []

        def http_client(**kwargs):
            calls.append(kwargs)
            return {"ok": True, "decision": {"id": "dec_123", "status": "edited"}}

        client = Forsig(api_key="fsk_test_123", base_url="https://example.test", http_client=http_client)
        decision = client.decide("esc_123", status="edited", instruction="Offer store credit.")

        self.assertEqual(decision["status"], "edited")
        self.assertEqual(calls[0]["method"], "POST")
        self.assertEqual(calls[0]["url"], "https://example.test/api/v1/escalations/esc_123/decision")
        self.assertEqual(calls[0]["payload"]["instruction"], "Offer store credit.")

    def test_client_cancels_escalation(self):
        calls = []

        def http_client(**kwargs):
            calls.append(kwargs)
            return {"ok": True, "escalation": {"id": "esc_123", "status": "canceled"}}

        client = Forsig(api_key="fsk_test_123", base_url="https://example.test", http_client=http_client)
        escalation = client.cancel_escalation("esc_123")

        self.assertEqual(escalation["status"], "canceled")
        self.assertEqual(calls[0]["method"], "POST")
        self.assertEqual(calls[0]["url"], "https://example.test/api/v1/escalations/esc_123/cancel")


if __name__ == "__main__":
    unittest.main()
