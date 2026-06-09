# AI Memory Gateway - Operator Manual Final

## Purpose
This document is the final operator manual for AI Memory Gateway v1 operations.

## Daily Operation Flow
1. Open Admin Console.
2. Run Daily Health Check.
3. Save Daily Health Check result.
4. Review Daily Operation Checklist.
5. Review Summary Queue and Summary Worker status.
6. Review Backup / Monitoring status.
7. Review Alerts and Operation Logs.

## Admin Console URL
http://localhost:3010/admin?token=ADMIN_TOKEN

## Normal Operations
- Daily Health Check: verifies API, DB, queue, memory, project assets, recent activity.
- Daily Operation Checklist: records daily manual operation status.
- Daily Automation: runs daily health save and checklist auto-mark.
- Summary Worker: processes pending summary queue into long-term memory.
- DB Backup Status: verifies backup directory and backup files.
- Resource Monitoring: checks DB, disk, queue, and worker evidence.
- Alert Rules: evaluates operational warnings and recommended operator actions.

## Startup Commands
API server:
```bash
cd "/z/01. Ai_Memory_System/api"
npm run dev
```

Summary worker once:
```bash
npm run worker:summary
```

Summary worker loop:
```bash
npm run worker:summary:loop
```

Daily operation worker:
```bash
npm run worker:daily-operation
```

## Backup Procedure
1. Open DB Backup Status.
2. Run Load Backup Status.
3. Run Manual DB Backup with confirmation.
4. Verify backup file appears in backup directory.
5. Load Backup History.
6. Verify SUCCESS or synced backup record.

Manual backup confirmation:
```json
{
  "dry_run": false,
  "gzip": true,
  "confirm_action": "RUN_MANUAL_DB_BACKUP",
  "confirm_text": "RUN_MANUAL_DB_BACKUP"
}
```

## Restore Policy
Actual restore execution remains disabled in v1 operation. Restore must be tested against a staging database first. Never restore directly over production DB without a fresh pre-restore backup and explicit confirmation.

## Security Operation
- Keep ADMIN_TOKEN private.
- Configure SECONDARY_ADMIN_TOKEN before token rotation.
- Use production mode to hide Developer / Diagnostic menus.
- Use &dev=1 only for maintenance.

## Troubleshooting
- Port 3010 in use: find PID and terminate it.
```bash
netstat -ano | findstr :3010
taskkill //PID PID번호 //F
```
- Admin token missing: check x-admin-token header or admin URL token.
- Backup missing: run manual DB backup.
- Queue pending: run summary worker.
- Provider live call failed: use Model Providers page to check provider status and available models.

## Completion
This manual belongs to Phase 14-4 and should be used as the baseline operator guide before final deployment checklist and completion report.
