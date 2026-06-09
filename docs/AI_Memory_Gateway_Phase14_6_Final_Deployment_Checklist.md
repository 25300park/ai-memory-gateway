# AI Memory Gateway - Phase 14-6 Final Deployment Checklist

## Purpose

Phase 14-6 checks the final deployment readiness of AI Memory Gateway v1 before the final project completion report.

## Runtime Commands

### API Server

```bash
cd "/z/01. Ai_Memory_System/api"
npm run dev
```

### Summary Worker Once

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:summary
```

### Summary Worker Loop

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:summary:loop
```

### Daily Operation Worker

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:daily-operation
```

### Port 3010 Conflict Recovery

```bash
netstat -ano | findstr :3010
taskkill //PID PID_NUMBER //F
npm run dev
```

## Checklist

1. Operator Manual exists in `api/docs`.
2. Server & Worker Runbook exists in `api/docs`.
3. Final Deployment Checklist exists in `api/docs`.
4. `ADMIN_TOKEN` is configured.
5. Secondary admin token is prepared for token rotation.
6. Dangerous action confirmation is enabled.
7. Production mode / developer menu policy is reviewed.
8. DB backup directory is configured or default backup path is available.
9. API server and worker commands are documented.
10. Phase 14 Smoke Test is run once more before final completion decision.

## Recommended Production Environment

```env
ADMIN_CONSOLE_MODE=production
ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS=true
ADMIN_SHOW_DEVELOPER_MENU=false
ADMIN_ALLOW_URL_DEV_MODE=true
DANGEROUS_ACTION_ENFORCEMENT_ENABLED=true
DANGEROUS_CONFIRMATION_REQUIRED=true
DB_BACKUP_DIR=Z:\01. Ai_Memory_System\backup
```

## Manual Checks

- Confirm Admin Console opens normally.
- Confirm Developer / Diagnostic menu is hidden in production mode.
- Confirm `&dev=1` opens diagnostic mode when allowed.
- Confirm at least one manual DB backup can be generated.
- Confirm Summary Worker can process pending queue.
- Confirm Daily Operation Worker command is documented.
- Run Phase 14 Smoke Test once more.

## Next Phase

Phase 14-7: Project Completion Report 생성
