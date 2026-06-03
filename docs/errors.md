# Forsig Errors

Forsig API errors use this shape:

```json
{
  "error": {
    "type": "forsig_api_error",
    "code": "invalid_api_key",
    "message": "Invalid or revoked Forsig API key."
  }
}
```

Common codes:

- `missing_api_key`
- `invalid_api_key`
- `invalid_escalation`
- `escalation_not_found`
- `escalation_already_resolved`
- `method_not_allowed`
- `database_connection_failed`

For private beta testing, log the `code` and `message`, but do not log raw API keys or sensitive escalation context.
