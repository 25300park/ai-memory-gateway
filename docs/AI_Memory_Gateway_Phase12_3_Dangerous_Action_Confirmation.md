# AI Memory Gateway - Phase 12-3 Dangerous Action Confirmation + Permission Enforcement

## Goal

Phase 12-3 adds a second protection layer for dangerous admin actions.

Protected requests must now satisfy both conditions:

1. The admin token role has the required permission.
2. The request includes an explicit confirmation phrase.

## New APIs

```txt
GET  /ai/security/dangerous-actions/status
GET  /ai/security/dangerous-actions/catalog
POST /ai/security/dangerous-actions/validate
GET  /ai/security/dangerous-actions/events?limit=50
POST /ai/security/dangerous-actions/test-confirmation
```

All APIs require `x-admin-token`.

## Confirmation Format

Use either headers:

```txt
x-admin-confirm-action: DRAIN_SUMMARY_QUEUE
x-admin-confirm-text: DRAIN_SUMMARY_QUEUE
```

or JSON body:

```json
{
  "confirm_action": "DRAIN_SUMMARY_QUEUE",
  "confirm_text": "DRAIN_SUMMARY_QUEUE"
}
```

## Protected Actions

The patch protects these routes:

```txt
POST /ai/system/daily-operation-checklist/reset
POST /ai/system/daily-automation/unlock
POST /ai/system/operation-logs/cleanup
POST /ai/summary/reset-stuck-processing
POST /ai/summary/drain
POST /ai/system/phase9-final-checklist/reset
POST /ai/response/storage/cleanup
```

## Environment Variables

```env
DANGEROUS_ACTION_ENFORCEMENT_ENABLED=true
DANGEROUS_CONFIRMATION_REQUIRED=true
DANGEROUS_CONFIRMATION_BYPASS_ROLES=
```

Recommended production value:

```env
DANGEROUS_ACTION_ENFORCEMENT_ENABLED=true
DANGEROUS_CONFIRMATION_REQUIRED=true
```

## Postman Test

### Status

```txt
GET http://localhost:3010/ai/security/dangerous-actions/status
```

### Catalog

```txt
GET http://localhost:3010/ai/security/dangerous-actions/catalog
```

### Validation

```txt
POST http://localhost:3010/ai/security/dangerous-actions/validate
```

Body:

```json
{
  "action_key": "TEST_DANGEROUS_CONFIRMATION",
  "confirm_action": "TEST_DANGEROUS_CONFIRMATION",
  "confirm_text": "TEST_DANGEROUS_CONFIRMATION"
}
```

### Confirmation Test

```txt
POST http://localhost:3010/ai/security/dangerous-actions/test-confirmation
```

Body:

```json
{
  "confirm_action": "TEST_DANGEROUS_CONFIRMATION",
  "confirm_text": "TEST_DANGEROUS_CONFIRMATION"
}
```

## Database Table

```txt
ai_dangerous_action_events
```

Check events:

```sql
SELECT *
FROM ai_dangerous_action_events
ORDER BY id DESC
LIMIT 20;
```

## Completion Criteria

```txt
[ ] Dangerous Actions menu is visible
[ ] status/catalog APIs work
[ ] validate API works
[ ] missing confirmation returns 409
[ ] correct confirmation passes
[ ] protected route requires confirmation
[ ] ai_dangerous_action_events table is created
[ ] existing Admin Security / Admin Permissions still works
```
