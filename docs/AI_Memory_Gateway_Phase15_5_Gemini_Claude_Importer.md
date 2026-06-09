# AI Memory Gateway - Phase 15-5 Gemini / Claude Importer Expansion

## Purpose

Phase 15-5 extends the import pipeline beyond ChatGPT and prepares Gemini / Claude export files for long-term AI Memory Gateway storage.

## Admin Menu

Memory Operation → Gemini / Claude Importer

## APIs

- `GET /ai/imports/gemini-claude/status`
- `GET /ai/imports/gemini-claude/checklist`
- `POST /ai/imports/gemini-claude/test`
- `POST /ai/imports/gemini-claude/import`

## Supported Input

- Gemini JSON or Google Takeout ZIP containing JSON files
- Claude JSON or ZIP containing JSON files

The parser is intentionally flexible because Gemini and Claude export structures may differ by account, plan, date, and region.

## Recommended Test Flow

1. Load importer status.
2. Run Gemini synthetic parser test.
3. Run Claude synthetic parser test.
4. Place the real export file under `Z:\01. Ai_Memory_System\imports`.
5. Import with `limit: 3` first.
6. Review results in Import Memory Search.
7. Queue selected imported conversations through Phase 15-3.
8. Run `npm run worker:summary`.

## Sample Gemini Import Body

```json
{
  "source_platform": "gemini",
  "file_path": "Z:\\01. Ai_Memory_System\\imports\\gemini_takeout.zip",
  "project_code": "rbs_ai_memory",
  "skip_duplicates": true,
  "limit": 3
}
```

## Sample Claude Import Body

```json
{
  "source_platform": "claude",
  "file_path": "Z:\\01. Ai_Memory_System\\imports\\claude_export.json",
  "project_code": "rbs_ai_memory",
  "skip_duplicates": true,
  "limit": 3
}
```

## Completion Criteria

- Gemini / Claude Importer menu is visible.
- Status API returns READY.
- Gemini synthetic parser test passes.
- Claude synthetic parser test passes.
- Real export file can be imported with a small limit.
- Imported records appear in Import Memory Search.
- Imported records can be queued to Summary Queue in Phase 15-3.
