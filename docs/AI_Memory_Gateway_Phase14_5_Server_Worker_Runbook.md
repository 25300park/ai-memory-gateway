# AI Memory Gateway Phase 14-5 Server & Worker Runbook

This runbook explains how to restart the AI Memory Gateway API server and worker processes after a reboot, power outage, terminal close, or local development restart.

## 1. API Server Restart Procedure

Open Git Bash and move to the project API directory.

```bash
cd "/z/01. Ai_Memory_System/api"
npm run dev
```

Expected result:

```txt
AI Memory Gateway starting...
AI Memory Gateway running on port 3010
```

Admin Console:

```txt
http://localhost:3010/admin?token=AI_Basic_Zarvis_2026
```

## 2. Summary Worker Procedure

The Summary Worker processes `ai_summary_queue` pending items and stores long-term memory into `ai_memory`.

One-time processing:

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:summary
```

Loop worker:

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:summary:loop
```

Recommended environment variables:

```bash
SUMMARY_WORKER_BATCH_LIMIT=5
SUMMARY_WORKER_INTERVAL_MS=30000
SUMMARY_WORKER_PROJECT_CODE=rbs_ai_memory
```

## 3. Daily Operation Worker Procedure

The Daily Operation Worker is used for scheduled health check / daily operation automation.

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:daily-operation
```

The worker should be run in a separate Git Bash window from the API server.

## 4. Port 3010 Conflict Recovery

If `npm run dev` fails with `EADDRINUSE`, port 3010 is already used by another process.

Find the PID:

```bash
netstat -ano | findstr :3010
```

Kill the PID in Git Bash:

```bash
taskkill //PID PID번호 //F
```

Then restart:

```bash
npm run dev
```

## 5. Git Bash Window Layout

Recommended local operation uses separate terminal windows.

```txt
Git Bash Window 1: API Server
cd "/z/01. Ai_Memory_System/api"
npm run dev

Git Bash Window 2: Summary Worker Loop
cd "/z/01. Ai_Memory_System/api"
npm run worker:summary:loop

Git Bash Window 3: Daily Operation Worker
cd "/z/01. Ai_Memory_System/api"
npm run worker:daily-operation
```

## 6. Health Check APIs

Use these APIs after restart.

```txt
GET /ai/system/daily-health-check
GET /ai/monitoring/system
GET /ai/monitoring/worker-status
GET /ai/backup/status
GET /ai/monitoring/alerts/status
```

All protected APIs require:

```txt
x-admin-token: AI_Basic_Zarvis_2026
```

## 7. Reboot Recovery Checklist

After NAS / mini PC / Windows reboot:

```txt
[ ] Confirm NAS / DB is online
[ ] Open Git Bash
[ ] Start API server with npm run dev
[ ] Open Admin Console
[ ] Run Daily Health Check
[ ] Start Summary Worker Loop if needed
[ ] Start Daily Operation Worker if scheduled automation is used
[ ] Check Backup Status
[ ] Check System Monitoring
[ ] Check Alert Rules
[ ] Run Phase 14 Smoke Test if anything looks abnormal
```

## 8. Troubleshooting

### API Server does not start

Check whether port 3010 is already in use.

```bash
netstat -ano | findstr :3010
taskkill //PID PID번호 //F
npm run dev
```

### Admin Console does not load

Check:

```txt
http://localhost:3010/admin?token=AI_Basic_Zarvis_2026
```

Then confirm `ADMIN_TOKEN` in `.env`.

### Summary Queue is pending

Run:

```bash
npm run worker:summary
```

or use Admin Console:

```txt
Summary Worker → Process Batch
```

### Backup is missing

Run Manual DB Backup:

```txt
DB Backup Status → Run Manual Backup
```

### Production Mode hides developer menus

Normal URL:

```txt
/admin?token=AI_Basic_Zarvis_2026
```

Developer diagnostic URL:

```txt
/admin?token=AI_Basic_Zarvis_2026&dev=1
```

## Phase 14-5 Completion

Phase 14-5 is complete when:

```txt
[ ] This runbook exists in api/docs
[ ] API server command is documented
[ ] Summary worker commands are documented
[ ] Daily operation worker command is documented
[ ] Port 3010 conflict recovery is documented
[ ] Git Bash window layout is documented
[ ] Reboot recovery checklist is documented
```
