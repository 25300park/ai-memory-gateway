# AI Memory Gateway - Phase 13-2 Manual DB Backup Execution

## Goal
Add a manual database backup execution flow to the Admin Console.

## Added APIs

- `POST /ai/backup/manual`
- `GET /ai/backup/manual/checklist`
- `POST /ai/backup/manual/test`

All APIs are protected by `x-admin-token`.

## Confirmation
Manual backup execution requires the following body values unless `dry_run=true`:

```json
{
  "confirm_action": "RUN_MANUAL_DB_BACKUP",
  "confirm_text": "RUN_MANUAL_DB_BACKUP"
}
```

## Recommended .env

```env
DB_BACKUP_DIR=Z:\01. Ai_Memory_System\backup
DB_BACKUP_GZIP=true
DB_BACKUP_CONFIRMATION_REQUIRED=true
MYSQLDUMP_PATH=mysqldump
```

If `mysqldump` is not available in PATH, set `MYSQLDUMP_PATH` to the full executable path.

## Postman Dry Run

```txt
POST http://localhost:3010/ai/backup/manual
```

```json
{
  "dry_run": true,
  "gzip": true,
  "confirm_action": "RUN_MANUAL_DB_BACKUP",
  "confirm_text": "RUN_MANUAL_DB_BACKUP"
}
```

## Postman Real Backup

```json
{
  "dry_run": false,
  "gzip": true,
  "confirm_action": "RUN_MANUAL_DB_BACKUP",
  "confirm_text": "RUN_MANUAL_DB_BACKUP"
}
```

## Completion Criteria

- Manual Backup panel appears in DB Backup Status screen.
- Dry run returns `DRY_RUN_READY`.
- Real backup creates `.sql.gz` or `.sql` file in backup directory.
- Backup Status refresh shows latest backup file.
- Missing confirmation blocks real backup.
