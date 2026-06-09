# Phase 13-2 Manual DB Backup Patch Guide

## Target
AI Memory Gateway API project root:

```bash
cd "/z/01. Ai_Memory_System/api"
```

## Files included

```text
src/services/manual-backup.service.js
src/services/backup-status.service.js
src/services/dangerous-action.service.js
src/routes/ai.routes.js
src/public/admin/index.html
src/public/admin/js/phase13-2-manual-backup.js
src/public/admin/css/phase13-2-manual-backup.css
```

## Added API endpoints

```text
GET  /ai/backup/manual/precheck
GET  /ai/backup/manual/history
POST /ai/backup/manual/run
```

## Dangerous Action Confirmation
Manual backup execution requires this exact confirmation:

```text
MANUAL_DB_BACKUP
```

## Required runtime tool
The server machine must be able to run `mysqldump`.

Check in Git Bash or CMD:

```bash
mysqldump --version
```

If it is not found, add the executable path to `.env`:

```env
MYSQLDUMP_BIN=C:\\Program Files\\MariaDB 11.4\\bin\\mysqldump.exe
```

The exact path may differ depending on your MariaDB/MySQL installation.

## Backup directory
The backup directory is selected in this order:

```text
1. DB_BACKUP_DIR
2. BACKUP_DIR
3. ../backup from the api folder
```

Manual backup creates the directory when running if it does not exist.

## Output files
Backup files are created as compressed SQL dumps:

```text
<DB_NAME>_YYYYMMDD_HHMMSSZ.sql.gz
```

Manual backup history is recorded here:

```text
backup_history.jsonl
```

## Apply
Unzip this patch over the existing project root, then run:

```bash
npm run dev
```

Open:

```text
http://localhost:3010/admin?token=AI_Basic_Zarvis_2026
```

Go to Backup / Monitoring > DB Backup Status.
