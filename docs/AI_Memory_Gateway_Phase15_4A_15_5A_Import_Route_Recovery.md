# AI Memory Gateway Phase 15-4A + 15-5A Route Recovery

## Purpose

This patch restores Phase 15 import routes that were lost after Phase 17 route merges.

It preserves the Personal AI Agent routes and re-adds:

- Import Memory Search routes
- Gemini / Claude Importer routes

## Restored APIs

### Import Memory Search

```txt
GET  /ai/imports/memory-search/status
GET  /ai/imports/memory-search/checklist
POST /ai/imports/memory-search/search
POST /ai/imports/memory-search/test
```

### Gemini / Claude Importer

```txt
GET  /ai/imports/gemini-claude/status
GET  /ai/imports/gemini-claude/checklist
POST /ai/imports/gemini-claude/test
POST /ai/imports/gemini-claude/import
```

## Apply

Copy files to:

```txt
Z:. Ai_Memory_Systempi
```

Then restart server:

```bash
cd "/z/01. Ai_Memory_System/api"
netstat -ano | findstr :3010
taskkill //PID <PID> //F
npm run dev
```

## Test

```txt
POST http://localhost:3010/ai/imports/memory-search/search
POST http://localhost:3010/ai/imports/gemini-claude/test
```

Use header:

```txt
x-admin-token: AI_Basic_Zarvis_2026
Content-Type: application/json
```
