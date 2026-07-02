# AI Memory Gateway - Phase 16-5
# Mini PC Runtime Hardening / Auto Start Strategy

## 1. Purpose

Phase 16-5 defines the runtime hardening and auto-start strategy for running AI Memory Gateway on a 24-hour Mini PC.

This phase does not require immediate installation on the Mini PC. It prepares the operating policy and runbook before actual deployment.

## 2. Current Recommended Runtime Architecture

```txt
Development PC
- Code modification
- Patch generation
- Git commit / push
- Local testing

GitHub Private Repository
- Source code backup
- Recovery source
- Mini PC deployment source

24-hour Mini PC
- Production-like runtime server
- API server
- Admin Console
- Summary Worker
- Daily Operation Worker

NAS
- MariaDB database
- Backup storage
- Long-term data storage

Tailscale
- Secure private network connection
- Mini PC to NAS access
- Remote administration path
```

## 3. Runtime Processes

AI Memory Gateway operation requires at least the following processes.

```txt
1. API Server
   Command: npm run dev
   Port: 3010
   Role: Admin Console, API routes, AI response pipeline

2. Summary Worker Loop
   Command: npm run worker:summary:loop
   Role: Process ai_summary_queue and write ai_memory

3. Daily Operation Worker
   Command: npm run worker:daily-operation
   Role: Daily checks and operation report jobs
```

The API server and worker processes should run in separate terminals or separate managed runtime processes.

## 4. Auto Start Options

### Option A: Manual Start

Best for early Mini PC verification.

```bash
cd "<mini-pc-project-path>"
npm run dev
```

Second terminal:

```bash
cd "<mini-pc-project-path>"
npm run worker:summary:loop
```

Advantages:

```txt
- Easy to debug
- Logs visible directly
- No Windows service complexity
```

Disadvantages:

```txt
- Must manually restart after reboot
- Not ideal for unattended operation
```

Recommended use:

```txt
Phase 16-4 actual runtime verification
Initial Mini PC testing period
```

### Option B: Windows Task Scheduler

Best first auto-start option for this project.

Recommended tasks:

```txt
Task 1: AI Memory Gateway API Server
Task 2: AI Memory Gateway Summary Worker Loop
Task 3: AI Memory Gateway Daily Operation Worker
```

Suggested trigger:

```txt
At startup
Delay task for 60 seconds
Run whether user is logged on or not
Restart on failure if available
```

Suggested action:

```txt
Program:
C:\Program Files\Git\bin\bash.exe

Arguments example:
-lc "cd '/c/ai-memory-gateway' && npm run dev"
```

For NAS path or cloned project path, adjust the `cd` path.

Advantages:

```txt
- Built into Windows
- No extra dependency
- Good for Mini PC
```

Disadvantages:

```txt
- Logs need separate handling
- Debugging can be less convenient
```

Recommended use:

```txt
First real auto-start implementation
```

### Option C: PM2

PM2 is a Node.js process manager. It can keep processes alive and restart on crash.

Install:

```bash
npm install -g pm2
```

Start commands:

```bash
pm2 start npm --name ai-memory-api -- run dev
pm2 start npm --name ai-memory-summary-worker -- run worker:summary:loop
pm2 start npm --name ai-memory-daily-worker -- run worker:daily-operation
```

Check status:

```bash
pm2 status
pm2 logs
```

Advantages:

```txt
- Good process monitoring
- Auto restart on crash
- Logs are centralized
```

Disadvantages:

```txt
- Windows startup integration needs extra setup
- Another dependency to manage
```

Recommended use:

```txt
After Mini PC basic runtime is stable
```

### Option D: NSSM Windows Service

NSSM can wrap Node commands as Windows services.

Advantages:

```txt
- Service-style operation
- Can start before user login
- Useful for long-term unattended operation
```

Disadvantages:

```txt
- More complex setup
- Harder for early debugging
```

Recommended use:

```txt
Later production hardening only
```

## 5. Recommended Strategy

The recommended staged strategy is:

```txt
Stage 1: Manual Start
- Verify GitHub clone
- Verify npm install
- Verify .env
- Verify NAS DB connection
- Verify Admin Console
- Verify worker execution

Stage 2: Windows Task Scheduler
- Add API server startup task
- Add Summary Worker startup task
- Add Daily Worker task if needed
- Test reboot recovery

Stage 3: PM2 or NSSM
- Adopt only after stable operation
- Use for stronger process supervision
```

Do not start with NSSM or PM2 before basic Mini PC verification is complete.

## 6. Runtime Hardening Checklist

```txt
[ ] Mini PC Windows updates completed
[ ] Node.js LTS installed
[ ] Git / Git Bash installed
[ ] Tailscale installed and logged in
[ ] Tailscale starts automatically after reboot
[ ] Mini PC can reach NAS DB host
[ ] GitHub repository cloned
[ ] npm install completed
[ ] .env restored
[ ] ADMIN_TOKEN set
[ ] DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD set
[ ] npm run dev succeeds
[ ] Admin Console opens on localhost:3010
[ ] Summary Worker runs
[ ] Daily Operation Worker runs when needed
[ ] Port 3010 conflict procedure tested
[ ] Manual backup procedure tested
[ ] Reboot recovery tested
[ ] Auto-start strategy selected
```

## 7. Port 3010 Conflict Procedure

```bash
netstat -ano | findstr :3010
taskkill //PID <PID_NUMBER> //F
npm run dev
```

## 8. Git Update Procedure on Mini PC

When code is updated from the development PC and pushed to GitHub:

```bash
cd "<mini-pc-project-path>"
git pull
npm install
npm run dev
```

If dependencies changed, `npm install` is required.

## 9. Log Strategy

Minimum recommended log policy:

```txt
- Keep API server terminal open during early testing
- Keep Summary Worker terminal open during early testing
- Check Admin Console Operation Logs
- Check Daily Health Check
- Check System Monitoring
```

For Task Scheduler or PM2 stage, configure logs to files later.

Suggested local log folder:

```txt
logs/
```

This folder should not be uploaded to GitHub.

## 10. Reboot Recovery Test

After choosing the auto-start method, perform this test:

```txt
1. Restart Mini PC
2. Wait 2 to 3 minutes
3. Confirm Tailscale is connected
4. Confirm NAS DB is reachable
5. Open Admin Console
6. Run Daily Health Check
7. Confirm Summary Worker status
8. Check Operation Logs
```

Phase 16-5 can be considered implemented only after this reboot recovery test passes on the actual Mini PC.

## 11. Decision

Current recommended decision:

```txt
Mini PC actual setup not yet completed.
Phase 16-5 may proceed as documentation and strategy.
Final runtime hardening decision should remain pending until Phase 16-4 actual Mini PC verification is completed.
```

## 12. Completion Criteria

```txt
[ ] Auto-start options documented
[ ] Recommended staged strategy selected
[ ] Runtime hardening checklist documented
[ ] Port conflict recovery documented
[ ] Git update procedure documented
[ ] Reboot recovery test documented
[ ] Actual auto-start method remains pending until Mini PC verification
```
