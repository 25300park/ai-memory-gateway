# Phase 13 Final Decision Gate Fix

This patch fixes Phase 13 Final readiness logic.

## Fixes

1. Reads backup file count from `backup_status.backup_directory.backup_file_count`.
2. Treats restore execution disabled as a safe condition, not a blocking failure.
3. Treats missing restorable backup as a manual backup readiness item when backup tooling is available.
4. Blocks Phase 14 only when explicit checklist items fail.
5. Allows `READY_WITH_MANUAL_CHECKS` when backup/monitoring/alerts still have warnings.

Expected result after applying:

```txt
decision_status: READY_WITH_MANUAL_CHECKS
phase14_entry_allowed: true
```

A real backup file is still recommended before production operation.
