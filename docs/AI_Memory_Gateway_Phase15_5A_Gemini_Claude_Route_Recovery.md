# AI Memory Gateway Phase 15-5A: Gemini / Claude Route Recovery

## Purpose

This patch restores the Gemini / Claude importer API routes that were missing after Phase 17 route merges.

## Changed file

- `src/routes/ai.routes.js`

## Restored routes

- `GET /ai/imports/gemini-claude/status`
- `GET /ai/imports/gemini-claude/checklist`
- `POST /ai/imports/gemini-claude/test`
- `POST /ai/imports/gemini-claude/import`

## Service dependency

The patch uses the existing service file:

- `src/services/gemini-claude-importer.service.js`

## Test

### Claude parser test

```json
{
  "scenario": "synthetic_parser",
  "source_platform": "claude"
}
```

### Claude import test

```json
{
  "source_platform": "claude",
  "file_path": "Z:\\01. Ai_Memory_System\\imports\\claude_export.json",
  "project_code": "rbs_ai_memory",
  "skip_duplicates": true,
  "limit": 3
}
```

## Notes

Do not reapply the old Phase 15-5 full patch over the current project because it may overwrite newer Phase 17 Agent routes. This patch only restores the missing Gemini / Claude importer route block.
