# AI Memory Gateway Phase 16-4
# Mini PC Actual Setup / Runtime Verification

## 1. Purpose

Phase 16-4 verifies that the AI Memory Gateway project can run on the 24-hour Mini PC as an actual runtime candidate.

This phase does not permanently switch production operations yet. It confirms that the Mini PC can:

- Clone the GitHub repository
- Install Node.js dependencies
- Restore `.env`
- Connect to NAS through Tailscale
- Connect to MariaDB
- Run the API server
- Open the Admin Console
- Run Summary Worker
- Run Daily Operation Worker
- Recover after restart

## 2. Target Runtime Structure

```txt
Development PC
- Code editing
- Patch testing
- Git commit / push

GitHub Private Repository
- Source code backup
- Deployment source

24-hour Mini PC
- Runtime server candidate
- API server
- worker processes

NAS
- MariaDB
- Backup storage
- Long-term data

Tailscale
- Secure network bridge between Mini PC and NAS
```

## 3. Mini PC Prerequisites

Install and verify the following on the Mini PC:

```txt
[ ] Windows update completed
[ ] Git installed
[ ] Git Bash installed
[ ] Node.js LTS installed
[ ] npm available
[ ] Tailscale installed
[ ] Tailscale login completed
[ ] Mini PC can reach NAS through Tailscale
[ ] Browser available for Admin Console test
[ ] Project folder selected
```

Recommended project folder:

```txt
D:\AI_Memory_Gateway\api
```

or

```txt
C:\AI_Memory_Gateway\api
```

Avoid storing the active runtime directly inside Downloads or Desktop.

## 4. Verify Git / Node / npm

Open Git Bash on the Mini PC and run:

```bash
git --version
node -v
npm -v
```

Expected:

```txt
git version shown
Node.js version shown
npm version shown
```

## 5. Verify Tailscale

Confirm that Tailscale is connected.

In Tailscale app:

```txt
Status: Connected
Account: correct account
NAS device visible
```

If the NAS has a Tailscale IP, test it:

```bash
ping <NAS_TAILSCALE_IP>
```

If ping is blocked, this may still be okay. MariaDB port test is more important.

## 6. Clone GitHub Repository

In Git Bash:

```bash
mkdir -p /d/AI_Memory_Gateway
cd /d/AI_Memory_Gateway
git clone https://github.com/25300park/ai-memory-gateway.git
cd ai-memory-gateway
```

If using `C:` instead:

```bash
mkdir -p /c/AI_Memory_Gateway
cd /c/AI_Memory_Gateway
git clone https://github.com/25300park/ai-memory-gateway.git
cd ai-memory-gateway
```

## 7. Install Dependencies

```bash
npm install
```

Expected:

```txt
node_modules folder created
no fatal install error
```

## 8. Restore .env

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Then edit `.env` manually.

Important values to restore:

```txt
PORT=3010
DB_HOST=<NAS_TAILSCALE_IP_OR_REACHABLE_HOST>
DB_PORT=3306
DB_NAME=rbs_viber
DB_USER=<actual_db_user>
DB_PASSWORD=<actual_db_password>
ADMIN_TOKEN=<actual_admin_token>
OPENAI_API_KEY=<actual_key_if_used>
ANTHROPIC_API_KEY=<actual_key_if_used>
GEMINI_API_KEY=<actual_key_if_used>
```

Do not commit `.env`.

## 9. Test NAS / MariaDB Connectivity

If a DB test script is not included in GitHub, use Admin APIs after server start.

Before starting the server, confirm the NAS host is reachable through Tailscale.

Optional TCP test using PowerShell:

```powershell
Test-NetConnection <NAS_TAILSCALE_IP_OR_HOST> -Port 3306
```

Expected:

```txt
TcpTestSucceeded : True
```

If false:

```txt
- Check Tailscale connection
- Check NAS firewall
- Check MariaDB bind address
- Check MariaDB user host permission
- Check DB_HOST value in .env
```

## 10. Start API Server

```bash
npm run dev
```

Expected:

```txt
AI Memory Gateway running on port 3010
DB connection config loaded = true
```

Open Admin Console on Mini PC browser:

```txt
http://localhost:3010/admin?token=<ADMIN_TOKEN>
```

Also test from another device over Tailscale if needed:

```txt
http://<MINI_PC_TAILSCALE_IP>:3010/admin?token=<ADMIN_TOKEN>
```

If remote device cannot open it:

```txt
- Check Windows Firewall inbound rule for port 3010
- Check server binds to 0.0.0.0 if external access is required
- Check Tailscale device connectivity
```

## 11. Health Check Verification

In Admin Console, verify:

```txt
[ ] Daily Health Check loads
[ ] System Monitoring loads
[ ] DB Backup Status loads
[ ] Imported Conversations status loads
[ ] Import Memory Search loads
[ ] Phase 15 Final status loads
```

## 12. Summary Worker Test

Open a second Git Bash window on the Mini PC.

```bash
cd /d/AI_Memory_Gateway/ai-memory-gateway
npm run worker:summary
```

For continuous mode:

```bash
npm run worker:summary:loop
```

Expected:

```txt
Worker starts without fatal error
Pending summary queue can be processed
```

## 13. Daily Operation Worker Test

Open a third Git Bash window.

```bash
cd /d/AI_Memory_Gateway/ai-memory-gateway
npm run worker:daily-operation
```

Expected:

```txt
Daily operation worker runs without fatal error
Operation logs / reports are generated when applicable
```

## 14. Port 3010 Conflict Handling

If port 3010 is already in use:

```bash
netstat -ano | findstr :3010
taskkill //PID <PID_NUMBER> //F
npm run dev
```

## 15. Runtime Window Layout

Recommended manual runtime layout:

```txt
Git Bash Window 1
- npm run dev

Git Bash Window 2
- npm run worker:summary:loop

Git Bash Window 3
- npm run worker:daily-operation when needed
```

Do not close these windows during manual operation.

## 16. Reboot Recovery Test

After basic success, reboot the Mini PC and verify:

```txt
[ ] Tailscale reconnects automatically
[ ] NAS is reachable
[ ] Git Bash can open project folder
[ ] npm run dev works
[ ] Admin Console opens
[ ] Summary Worker starts
```

This confirms the Mini PC is ready for actual runtime migration.

## 17. Completion Criteria

Phase 16-4 is complete when:

```txt
[ ] GitHub repository cloned on Mini PC
[ ] npm install completed
[ ] .env restored
[ ] Tailscale connected
[ ] NAS DB port reachable
[ ] npm run dev starts successfully
[ ] Admin Console opens on Mini PC
[ ] Health Check / Monitoring loads
[ ] Summary Worker runs
[ ] Daily Operation Worker runs or command verified
[ ] Reboot recovery verified
```

## 18. Next Phase

After Phase 16-4, proceed to:

```txt
Phase 16-5: Mini PC Runtime Hardening / Auto Start Strategy
```

Candidate options:

```txt
- Windows Task Scheduler
- PM2
- NSSM Windows Service
- Manual Git Bash operation first
```

Recommended approach:

```txt
Start with manual Git Bash runtime.
After stable operation, move to PM2 or Task Scheduler.
```
