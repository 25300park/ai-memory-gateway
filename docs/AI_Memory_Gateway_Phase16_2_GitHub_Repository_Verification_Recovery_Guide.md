# AI Memory Gateway - Phase 16-2
# GitHub Repository Verification / Recovery Guide

## 1. Purpose

Phase 16-2 verifies that the AI Memory Gateway repository uploaded to GitHub can be safely used as the source of truth for recovery, migration, and future deployment.

This guide focuses on:

- Verifying that the GitHub repository contains only safe project files.
- Confirming that secrets and runtime data are not included.
- Documenting how to recover the project on a new PC or 24-hour mini PC.
- Documenting the commands required to reinstall dependencies and restart the server/workers.
- Preparing for a later mini PC or cloud deployment.

Repository:

```txt
https://github.com/25300park/ai-memory-gateway
```

Visibility:

```txt
Private
```

---

## 2. Repository Verification Checklist

Open the GitHub repository and confirm that the following files and folders are visible:

```txt
docs/
src/
.env.example
.gitignore
README.md
package.json
package-lock.json
```

The following files and folders must NOT be visible:

```txt
.env
node_modules/
imports/
exports/
backup/
backups/
*.zip
*.7z
*.sql
*.dump
*.bak
*.gz
test-db.js
test-mariadb.js
test-tcp.js
```

If any sensitive file was accidentally uploaded, stop using the exposed credentials immediately and rotate the affected values before continuing.

---

## 3. Local Repository Verification Commands

From the current development PC:

```bash
cd "/z/01. Ai_Memory_System/api"
git status
git remote -v
git branch
```

Expected remote:

```txt
origin  https://github.com/25300park/ai-memory-gateway.git (fetch)
origin  https://github.com/25300park/ai-memory-gateway.git (push)
```

Expected branch:

```txt
main
```

Expected status after successful push:

```txt
nothing to commit, working tree clean
```

If the working tree is not clean, review the listed files before committing.

---

## 4. Safe GitHub Push Workflow

Use this workflow for future updates:

```bash
cd "/z/01. Ai_Memory_System/api"
git status
git add .
git status
git commit -m "Describe the update"
git push
```

Before committing, always confirm that these files are not staged:

```txt
.env
node_modules/
imports/
backup/
backups/
*.zip
*.sql
```

---

## 5. Recovery on a New PC or 24-Hour Mini PC

### 5.1 Required Software

Install the following first:

```txt
Node.js LTS
Git
Git Bash
Tailscale
Optional: VS Code
Optional: DBeaver
```

### 5.2 Clone the Repository

Choose a working folder. Example:

```bash
mkdir -p "/z/01. Ai_Memory_System"
cd "/z/01. Ai_Memory_System"
git clone https://github.com/25300park/ai-memory-gateway.git api
cd api
```

If the mini PC does not use the same `Z:` network drive, choose a local path such as:

```bash
mkdir -p "/c/AI_Memory_System"
cd "/c/AI_Memory_System"
git clone https://github.com/25300park/ai-memory-gateway.git api
cd api
```

---

## 6. Reinstall Dependencies

After clone:

```bash
npm install
```

This recreates `node_modules/` from `package.json` and `package-lock.json`.

Never copy `node_modules/` through GitHub.

---

## 7. Restore `.env`

The real `.env` file is intentionally not uploaded to GitHub.

Create a new `.env` from the example file:

```bash
cp .env.example .env
```

Then edit `.env` and fill in the real values.

Required categories:

```txt
Server port
DB host / port / name / user / password
Admin token
Provider API keys
Backup path
Production/dev mode settings
Worker settings
```

Never commit `.env`.

Confirm:

```bash
git status
```

`.env` must not appear in staged or untracked files.

---

## 8. NAS / DB Connection Verification

If the server PC accesses the NAS through Tailscale, confirm Tailscale is connected before starting the API server.

Basic checks:

```bash
ping <NAS_TAILSCALE_IP_OR_HOSTNAME>
```

If MariaDB is exposed on the NAS Tailscale network, confirm the DB connection by starting the server and checking health/admin endpoints.

Recommended checks:

```txt
Tailscale connected
NAS reachable
MariaDB port reachable
DB credentials valid
DB name exists
```

If DB connection fails, check:

```txt
DB_HOST in .env
DB_PORT in .env
DB_USER in .env
DB_PASSWORD in .env
NAS firewall
MariaDB bind address
Tailscale route / ACL
```

---

## 9. Start API Server

Development mode:

```bash
cd "/z/01. Ai_Memory_System/api"
npm run dev
```

If using a different path on the mini PC, change the path accordingly.

Admin Console:

```txt
http://localhost:3010/admin?token=<ADMIN_TOKEN>
```

If running on a mini PC and accessing from another device, use the mini PC IP or Tailscale IP:

```txt
http://<MINI_PC_TAILSCALE_IP>:3010/admin?token=<ADMIN_TOKEN>
```

---

## 10. Start Workers

Use separate Git Bash windows.

### API Server Window

```bash
cd "/z/01. Ai_Memory_System/api"
npm run dev
```

### Summary Worker Window

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:summary:loop
```

### Daily Operation Worker Window

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:daily-operation
```

For one-time summary processing:

```bash
npm run worker:summary
```

---

## 11. Port 3010 Conflict Recovery

If the server cannot start because port 3010 is already in use:

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

---

## 12. Backup / Imports / Exports Folders

These folders are runtime data folders and must stay outside GitHub:

```txt
backup/
backups/
imports/
exports/
```

Create them manually on the server PC if needed:

```bash
mkdir -p "/z/01. Ai_Memory_System/backup"
mkdir -p "/z/01. Ai_Memory_System/imports"
mkdir -p "/z/01. Ai_Memory_System/exports"
```

The ChatGPT / Gemini / Claude export files should be copied into `imports/` only on the server PC. They must not be committed.

---

## 13. Recovery Test Checklist

After cloning on a new PC or mini PC, verify:

```txt
[ ] Repository cloned successfully
[ ] npm install completed
[ ] .env created from .env.example
[ ] Real DB credentials inserted into .env
[ ] Tailscale connected if NAS access is required
[ ] npm run dev starts without error
[ ] Admin Console loads
[ ] Daily Health Check runs
[ ] Summary Worker command runs
[ ] DB Backup Status loads
[ ] Import Memory Search loads
[ ] GitHub does not contain .env or runtime data
```

---

## 14. Emergency Recovery Procedure

If the local project folder is damaged:

```bash
cd "/z/01. Ai_Memory_System"
mv api api_broken_backup
git clone https://github.com/25300park/ai-memory-gateway.git api
cd api
npm install
cp .env.example .env
```

Then restore real `.env` values from the secure local backup and run:

```bash
npm run dev
```

Do not delete the broken folder until confirming that the recovered project works.

---

## 15. Phase 16-2 Completion Criteria

Phase 16-2 is complete when:

```txt
[ ] GitHub repository is private
[ ] Repository contains docs, src, README, package files
[ ] Repository excludes .env, node_modules, imports, backups, zip/sql files
[ ] Remote origin points to the correct GitHub URL
[ ] Local working tree is clean
[ ] Recovery procedure is documented
[ ] New PC / mini PC setup procedure is documented
[ ] Worker restart procedure is documented
[ ] Sensitive file check procedure is documented
```

Status after completion:

```txt
PHASE16_2_GITHUB_RECOVERY_GUIDE_READY
```
