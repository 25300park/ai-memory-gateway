# Phase 13 Final Restore Readiness + Worker Evidence Fix

## Purpose

This patch fixes two issues found during Phase 13 Final testing:

1. Phase 13 Final incorrectly treated `restore_execution_enabled: false` as a blocking restore failure.
2. Resource Monitoring queried a `status` column in `ai_daily_operation_automation_runs`, but the current table schema may not contain that column.

## Changes

### `src/services/phase13-final.service.js`

- Treats Restore Readiness as PASS when:
  - the Restore Readiness API/checklist is available, and
  - actual restore execution remains intentionally disabled.
- Missing restorable backup files are handled as manual backup readiness checks instead of blocking restore-tooling failure.
- Phase 14 entry can now proceed as `READY_WITH_MANUAL_CHECKS` when backup files still require manual confirmation.

### `src/services/system-monitoring.service.js`

- Dynamically detects available columns in `ai_daily_operation_automation_runs`.
- Uses `status` only when the column exists.
- Supports schemas using `run_status` or no status-like column.
- Prevents worker monitoring from failing due to schema mismatch.

## Test

Run:

```bash
cd "/z/01. Ai_Memory_System/api"
npm run dev
```

Then call:

```http
GET /ai/system/phase13-final-decision
```

Expected:

- `decision_status` should become `READY_WITH_MANUAL_CHECKS` if the only remaining issue is missing actual backup file.
- `phase14_entry_allowed` should become `true`.
- The daily worker column error should disappear from Resource Monitoring.
