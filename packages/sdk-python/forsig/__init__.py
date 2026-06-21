from __future__ import annotations

import uuid
import time
from typing import Any, Callable, Dict, Mapping, Optional
from urllib import request as urllib_request
from urllib.error import HTTPError


def new_forsig_session(prefix: str = "sess") -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def forsig_headers(
    agent_id: Optional[str] = None,
    agent_instance_id: Optional[str] = None,
    session_id: Optional[str] = None,
    external_user_id: Optional[str] = None,
    request_id: Optional[str] = None,
    metadata: Optional[Mapping[str, Any]] = None,
) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if agent_id:
        headers["x-forsig-agent-id"] = agent_id
    if agent_instance_id:
        headers["x-forsig-agent-instance-id"] = agent_instance_id
    if session_id:
        headers["x-forsig-session-id"] = session_id
    if external_user_id:
        headers["x-forsig-external-user-id"] = external_user_id
    if request_id:
        headers["x-forsig-request-id"] = request_id
    if metadata:
        for key, value in metadata.items():
            if value is not None:
                headers[f"x-forsig-meta-{key}"] = str(value)
    return headers


def parse_forsig_error(error: Any) -> Dict[str, Any]:
    status = getattr(error, "status_code", None) or getattr(error, "status", None)
    payload = getattr(error, "error", None)
    if payload is None and isinstance(error, Mapping):
        status = error.get("status", status)
        payload = error.get("error") or error.get("body", {}).get("error")
    if not isinstance(payload, Mapping):
        return {"is_forsig_error": False, "status": status}
    error_type = payload.get("type")
    return {
        "is_forsig_error": isinstance(error_type, str) and error_type.startswith("forsig_"),
        "status": status,
        "type": error_type,
        "code": payload.get("code"),
        "message": payload.get("message"),
    }


def create_forsig_openai_client(api_key: str, base_url: str = "https://www.forsig.com/api/v1", openai_client_cls: Any = None) -> Any:
    if openai_client_cls is None:
        return {"api_key": api_key, "base_url": base_url}
    return openai_client_cls(api_key=api_key, base_url=base_url)


class Forsig:
    def __init__(self, api_key: str, base_url: str = "https://www.forsig.com", http_client: Optional[Callable[..., Dict[str, Any]]] = None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.http_client = http_client

    def escalate(self, **payload: Any) -> Dict[str, Any]:
        wait_for_decision = bool(payload.pop("wait_for_decision", payload.pop("waitForDecision", False)))
        poll_interval = float(payload.pop("poll_interval_seconds", 1.5))
        timeout = float(payload.pop("timeout_seconds", 30 * 60))
        response = self._request("POST", "/api/v1/escalations", payload)
        escalation = response["escalation"]
        if not wait_for_decision:
            return escalation
        return self.wait_for_decision(escalation["id"], poll_interval_seconds=poll_interval, timeout_seconds=timeout)

    def get_escalation(self, escalation_id: str) -> Dict[str, Any]:
        response = self._request("GET", f"/api/v1/escalations/{escalation_id}")
        return response["escalation"]

    def decide(self, escalation_id: str, **decision: Any) -> Dict[str, Any]:
        response = self._request("POST", f"/api/v1/escalations/{escalation_id}/decision", decision)
        return response["decision"]

    def cancel_escalation(self, escalation_id: str) -> Dict[str, Any]:
        response = self._request("POST", f"/api/v1/escalations/{escalation_id}/cancel", {})
        return response["escalation"]

    def wait_for_decision(self, escalation_id: str, poll_interval_seconds: float = 1.5, timeout_seconds: float = 30 * 60) -> Dict[str, Any]:
        started = time.time()
        while time.time() - started <= timeout_seconds:
            escalation = self.get_escalation(escalation_id)
            if escalation.get("status") != "pending":
                return escalation.get("decision") or escalation
            time.sleep(poll_interval_seconds)
        raise TimeoutError(f"Forsig escalation {escalation_id} did not receive a decision before timeout.")

    def _request(self, method: str, path: str, payload: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
        if self.http_client is not None:
            return self.http_client(method=method, url=f"{self.base_url}{path}", api_key=self.api_key, payload=payload)

        import json

        data = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib_request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={
                "authorization": f"Bearer {self.api_key}",
                "content-type": "application/json",
            },
        )
        try:
            with urllib_request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            body = error.read().decode("utf-8")
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = {"error": {"message": body}}
            message = parsed.get("error", {}).get("message", "Forsig request failed.")
            raise RuntimeError(message) from error
