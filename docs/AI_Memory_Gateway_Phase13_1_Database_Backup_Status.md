# AI Memory Gateway - Phase 13-1 Database Backup Status

## Goal

Phase 13-1 adds a read-only database backup status screen to the Admin Console.

This phase does not execute a backup yet. It verifies whether the system can see the database, inspect key AI Memory tables, and detect the configured backup directory and existing backup files.

## Added Admin Menu

- Backup / Monitoring
  - DB Backup Status

## Added API

All APIs require `x-admin-token`.

```txt
GET  /ai/backup/status
GET  /ai/backup/checklist
POST /ai/backup/status/test
```

## Environment Variables

Optional:

```env
DB_BACKUP_DIR=Z:\\01. Ai_Memory_System\\backup
DB_BACKUP_REQUIRED=false
```

If `DB_BACKUP_DIR` is not set, the default path is:

```txt
../backup from the API folder
```

For the current project path, this normally resolves to:

```txt
Z:\01. Ai_Memory_System\backup
```

## Status Meaning

```txt
GOOD
- DB connection works
- Backup directory is readable
- No blocking errors found

WARNING
- Backup directory missing
- No backup files found
- Backup directory not writable
- Some optional table counts failed

ERROR
- DB connection failed
- Backup directory is unreadable when required
- DB_BACKUP_REQUIRED=true and no backup exists
```

## Postman Test

### Backup Status

```txt
GET http://localhost:3010/ai/backup/status
```

Header:

```txt
x-admin-token: AI_Basic_Zarvis_2026
```

### Backup Checklist

```txt
GET http://localhost:3010/ai/backup/checklist
```

### Backup Status Test

```txt
POST http://localhost:3010/ai/backup/status/test
```

Body:

```json
{
  "scenario": "current"
}
```

Supported scenarios:

```txt
current
missing_backup_dir
required_without_backup
```

## Completion Criteria

```txt
[ ] Backup / Monitoring group appears in the sidebar
[ ] DB Backup Status menu appears
[ ] GET /ai/backup/status returns backup_status
[ ] DB connection details are displayed without exposing DB_PASSWORD
[ ] Backup directory exists/readable/writable status is displayed
[ ] Important table counts are displayed
[ ] Recent backup files are displayed when present
[ ] Checklist and test APIs work
```

## Next Phase

Phase 13-2: Manual DB Backup execution.
