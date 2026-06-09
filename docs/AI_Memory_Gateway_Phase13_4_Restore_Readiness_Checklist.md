# AI Memory Gateway - Phase 13-4 Restore Readiness Checklist

## Purpose
Phase 13-4 adds a restore readiness screen and APIs. It does **not** execute a database restore. It checks whether the system is ready to safely plan a restore later.

## APIs

- `GET /ai/backup/restore-readiness`
- `GET /ai/backup/restore-readiness/checklist`
- `POST /ai/backup/restore-readiness/test`

All APIs require `x-admin-token`.

## Checks

- Current DB connection
- Backup directory readability
- Latest restorable backup file
- Backup history success or synced file record
- Restore target DB policy
- mysql client path readiness
- Future dangerous confirmation requirement
- Manual pre-restore backup requirement

## Recommended environment variables

```env
DB_RESTORE_TARGET_DB=rbs_viber_restore_test
MYSQL_CLIENT_PATH=mysql
DB_BACKUP_DIR=Z:\01. Ai_Memory_System\backup
```

## Safety
Actual restore execution is intentionally disabled in this phase. Future restore execution should only target a staging/temp database first and must require `RUN_DB_RESTORE` confirmation.
