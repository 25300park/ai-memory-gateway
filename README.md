# AI Memory Gateway

AI Memory Gateway is an internal long-term memory gateway for AI-assisted project work. It stores project assets, recent conversations, summarized memory, imported conversations, provider responses, operational logs, backups, and monitoring status.

## Current Status

- Phase 14 Final completed: AI Memory Gateway v1 completion decision passed.
- Phase 15 completed: Imported Conversation Memory Pipeline completed.
- Phase 16 started: GitHub upload and deployment preparation.

## Main Features

- Admin Console
- Project Assets
- Recent Buffer
- Summarized Memory
- AI Response Pipeline
- OpenAI / Anthropic / Gemini provider router
- Provider fallback
- Daily Health Check
- Summary Worker
- DB Backup / Backup History
- Restore Readiness
- System Monitoring
- Imported Conversation Storage
- ChatGPT Export ZIP Importer
- Gemini / Claude Importer preparation
- Import Memory Search
- Import Quality Review / Deduplication

## Local Development

```bash
cd "/z/01. Ai_Memory_System/api"
npm install
cp .env.example .env
npm run dev
```

Admin Console:

```txt
http://localhost:3010/admin?token=YOUR_ADMIN_TOKEN
```

## Worker Commands

```bash
npm run worker:summary
npm run worker:summary:loop
npm run worker:daily-operation
```

## Port 3010 Conflict

```bash
netstat -ano | findstr :3010
taskkill //PID PID_NUMBER //F
npm run dev
```

## GitHub Safety Rules

Never commit:

- `.env`
- database passwords
- API keys
- backup files
- import/export ZIP files
- SQL dumps
- `node_modules`

Commit these:

- source code
- docs
- `.env.example`
- `.gitignore`
- README
- package.json / package-lock.json

## Production Direction

Recommended operation order:

1. Complete GitHub repository setup.
2. Test real ChatGPT export import after OpenAI email arrives.
3. Move operation to 24-hour mini PC.
4. Connect mini PC to NAS DB through Tailscale.
5. Later evaluate Render / Railway / VPS after DB hosting strategy is decided.
