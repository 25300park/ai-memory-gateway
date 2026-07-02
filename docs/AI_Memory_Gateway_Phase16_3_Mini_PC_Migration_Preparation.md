# AI Memory Gateway — Phase 16-3 Mini PC Migration Preparation

## Purpose

Phase 16-3 prepares a 24-hour Mini PC to become the future always-on operating server for AI Memory Gateway.

This phase does not require immediate production migration. The current development PC can remain the main development environment until the Mini PC is ready and verified.

## Recommended Operating Architecture

```txt
Development PC
- Code editing
- Patch testing
- Git commit / push
- Postman / DBeaver testing

24-hour Mini PC
- Future API server runtime
- Future summary worker runtime
- Future daily operation worker runtime

NAS
- MariaDB / long-term database
- backup directory
- imports / exports storage if required

Tailscale
- Secure remote access between Mini PC, NAS, and development PC
```

## Migration Principle

Do not mix development completion and server migration in the same step.

Recommended order:

```txt
1. Keep developing on the current local PC.
2. Keep GitHub repository updated.
3. Prepare the Mini PC environment separately.
4. Clone the GitHub repository on the Mini PC.
5. Restore .env manually on the Mini PC.
6. Test NAS DB connectivity through Tailscale.
7. Run the API server and workers.
8. Only after verification, switch the Mini PC into the always-on server role.
```

## Mini PC Installation Checklist

### Required Software

```txt
[ ] Windows update completed
[ ] Git installed
[ ] Git Bash installed
[ ] Node.js LTS installed
[ ] npm available
[ ] Tailscale installed
[ ] Tailscale login completed
[ ] Browser installed for Admin Console check
[ ] Optional: VS Code installed
[ ] Optional: DBeaver installed
[ ] Optional: Postman installed
```

### Recommended Folder

```txt
C:\AI_Memory_System\api
```

or

```txt
D:\AI_Memory_System\api
```

Avoid running the operational server directly from a fragile mapped network drive unless it has already been tested for stability.

## GitHub Clone Procedure

```bash
git clone https://github.com/25300park/ai-memory-gateway.git
cd ai-memory-gateway
npm install
```

If a specific folder is preferred:

```bash
mkdir -p /c/AI_Memory_System
cd /c/AI_Memory_System
git clone https://github.com/25300park/ai-memory-gateway.git api
cd api
npm install
```

## .env Restoration Procedure

The real `.env` file is not stored in GitHub.

On the Mini PC:

```bash
cp .env.example .env
```

Then edit `.env` manually.

Minimum required values:

```env
PORT=3010
NODE_ENV=development
ADMIN_TOKEN=replace_with_real_admin_token
DB_HOST=replace_with_nas_or_tailscale_ip
DB_PORT=3306
DB_NAME=rbs_viber
DB_USER=replace_with_db_user
DB_PASSWORD=replace_with_db_password
```

Never commit `.env` to GitHub.

## Tailscale / NAS Check

Confirm that the Mini PC can reach the NAS.

```bash
ping <NAS_TAILSCALE_IP_OR_HOSTNAME>
```

If ping is blocked, test DB connectivity instead.

```bash
nc -vz <NAS_TAILSCALE_IP_OR_HOSTNAME> 3306
```

On Windows Git Bash, if `nc` is unavailable, use PowerShell:

```powershell
Test-NetConnection <NAS_TAILSCALE_IP_OR_HOSTNAME> -Port 3306
```

## API Server Test

```bash
cd /c/AI_Memory_System/api
npm run dev
```

Expected result:

```txt
AI Memory Gateway running on port 3010
```

Admin Console:

```txt
http://localhost:3010/admin?token=<ADMIN_TOKEN>
```

## Worker Execution Test

Open a separate Git Bash window for each long-running process.

### Window 1 — API Server

```bash
cd /c/AI_Memory_System/api
npm run dev
```

### Window 2 — Summary Worker Loop

```bash
cd /c/AI_Memory_System/api
npm run worker:summary:loop
```

### Window 3 — Daily Operation Worker

```bash
cd /c/AI_Memory_System/api
npm run worker:daily-operation
```

## Port 3010 Conflict Resolution

Windows Command Prompt or Git Bash:

```bash
netstat -ano | findstr :3010
```

Then kill the process:

```bash
taskkill //PID <PID_NUMBER> //F
```

Restart:

```bash
npm run dev
```

## Git Update Procedure on Mini PC

When development PC pushes a new patch to GitHub, update the Mini PC:

```bash
cd /c/AI_Memory_System/api
git pull
npm install
npm run dev
```

Run `npm install` after pull when `package.json` or `package-lock.json` changed.

## Manual Backup Check

Before switching the Mini PC to production-like operation:

```txt
[ ] DB backup directory exists
[ ] mysqldump command works
[ ] Manual Backup succeeds from Admin Console
[ ] Backup History records success
[ ] backup files are not committed to GitHub
```

## Auto-start Candidate Options

Do not enable auto-start until manual execution is stable.

Candidate options:

```txt
Option A: Windows Task Scheduler
Option B: NSSM Windows Service wrapper
Option C: PM2 for Node.js process management
Option D: Keep Git Bash windows open during early operation
```

Recommended early stage:

```txt
Manual start first → PM2 or Task Scheduler later
```

## Completion Criteria

```txt
[ ] Mini PC has Git / Node.js / npm installed
[ ] Tailscale installed and connected
[ ] GitHub repository cloned
[ ] npm install completed
[ ] .env restored manually
[ ] NAS DB connection verified
[ ] npm run dev starts successfully
[ ] Admin Console opens on Mini PC
[ ] Summary Worker command works
[ ] Daily Operation Worker command works
[ ] Port conflict recovery command verified
[ ] Git pull update procedure documented
```

## Phase 16-3 Decision

Phase 16-3 is complete when the Mini PC preparation checklist is documented and ready to execute.

Actual migration may happen later in Phase 16-4 or a separate Mini PC setup session.
