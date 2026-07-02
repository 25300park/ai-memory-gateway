# Phase 16-3 Addendum — Mini PC Migration Preparation

This addendum summarizes the future Mini PC operating plan for AI Memory Gateway.

## Recommended Role Split

```txt
Development PC:
- edit code
- test patches
- commit and push to GitHub

24-hour Mini PC:
- clone GitHub repository
- run API server
- run summary worker
- run daily operation worker

NAS:
- MariaDB
- backups
- import/export storage

Tailscale:
- secure network path between Mini PC and NAS
```

## Quick Start on Mini PC

```bash
mkdir -p /c/AI_Memory_System
cd /c/AI_Memory_System
git clone https://github.com/25300park/ai-memory-gateway.git api
cd api
npm install
cp .env.example .env
npm run dev
```

After copying `.env.example`, edit `.env` manually with the real DB, admin token, and provider keys.

## Do Not Commit

```txt
.env
node_modules/
imports/
backup/
backups/
*.zip
*.sql
```

## Next Phase

Phase 16-4 should verify the Mini PC setup with actual commands and decide whether to keep local development separate from always-on operation.
