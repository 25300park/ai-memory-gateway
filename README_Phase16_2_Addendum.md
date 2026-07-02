# Phase 16-2 Addendum

This addendum summarizes the GitHub verification and recovery workflow for AI Memory Gateway.

## Quick Recovery

```bash
git clone https://github.com/25300park/ai-memory-gateway.git api
cd api
npm install
cp .env.example .env
npm run dev
```

Then edit `.env` with the real server, DB, admin token, and provider credentials.

## Never Commit

```txt
.env
node_modules/
imports/
backup/
backups/
*.zip
*.sql
```
