from __future__ import annotations

import uuid
from typing import Any, Dict, Mapping, Optional


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


def create_forsig_openai_client(api_key: str, base_url: str = "https://api.forsig.com/v1", openai_client_cls: Any = None) -> Any:
    if openai_client_cls is None:
        return {"api_key": api_key, "base_url": base_url}
    return openai_client_cls(api_key=api_key, base_url=base_url)
