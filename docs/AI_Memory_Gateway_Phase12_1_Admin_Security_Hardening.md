# AI Memory Gateway - Phase 12-1 Admin Security Hardening

## Goal

Phase 12-1 strengthens Admin API security and prepares token rotation.

## Added Features

- ADMIN_TOKEN validation hardening
- SECONDARY_ADMIN_TOKEN / ADMIN_TOKEN_NEXT rotation support
- Standardized auth responses
  - 401 ADMIN_TOKEN_MISSING
  - 403 ADMIN_TOKEN_INVALID
  - 500 ADMIN_TOKEN_NOT_CONFIGURED
- Admin auth success/failure event logging
- Admin Security screen in Admin Console
- Token fingerprint display without exposing raw token values

## Recommended .env

```env
ADMIN_ENABLED=true
ADMIN_TOKEN=your_current_long_admin_token
SECONDARY_ADMIN_TOKEN=your_next_long_admin_token
```

`SECONDARY_ADMIN_TOKEN` may be left blank during development, but production rotation is ready only when it is configured.

## Token Rotation Procedure

1. Keep current `ADMIN_TOKEN` unchanged.
2. Add `SECONDARY_ADMIN_TOKEN` with the new token value.
3. Restart the server.
4. Open Admin Console with the secondary token.
5. Confirm Admin Security shows `rotation_ready: true`.
6. Promote the new token to `ADMIN_TOKEN`.
7. Remove the old token.
8. Restart the server again.

## New API

```txt
GET /ai/security/admin/status
GET /ai/security/admin/events?limit=50
```

Both APIs require `x-admin-token`.

## DB Table

The following table is automatically created when auth events are logged or requested:

```txt
ai_admin_security_events
```

## Test

```txt
GET http://localhost:3010/ai/security/admin/status
x-admin-token: ADMIN_TOKEN
```

Expected:

```json
{
  "ok": true,
  "phase": "12-1",
  "status": "GOOD or WARNING",
  "rotation_ready": true
}
```

## Completion Criteria

- Existing ADMIN_TOKEN still works
- SECONDARY_ADMIN_TOKEN works when configured
- Missing token returns 401
- Invalid token returns 403
- Admin Security screen displays status
- Auth event logs are stored
