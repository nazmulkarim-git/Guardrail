import unittest

from forsig import (
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
        self.assertEqual(client["base_url"], "https://api.forsig.com/v1")


if __name__ == "__main__":
    unittest.main()
