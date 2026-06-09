# AI Memory Gateway - Phase 15-4 Import Memory Search

## Purpose

Phase 15-4 adds an Admin Console search screen and API layer for imported conversations. It allows the operator to search ChatGPT / Gemini / Claude imported conversations before and after they are queued for summary or linked to long-term memory.

## Admin Menu

Memory Operation -> Import Memory Search

## APIs

- GET `/ai/imports/memory-search/status`
- GET `/ai/imports/memory-search/checklist`
- POST `/ai/imports/memory-search/search`
- POST `/ai/imports/memory-search/test`

All routes require `x-admin-token`.

## Search Body Example

```json
{
  "project_code": "rbs_ai_memory",
  "source_platform": "chatgpt",
  "memory_status": "all",
  "keyword": "Phase 14",
  "limit": 20
}
```

## Supported Filters

- `project_code`: project memory group, such as `rbs_ai_memory`
- `source_platform`: `chatgpt`, `gemini`, `claude`, or blank for all
- `memory_status`: `all`, `unqueued`, `queued`, `completed`, `failed`
- `keyword`: scans title, source conversation id, normalized text, and imported message content
- `limit`: max 100

## Completion Criteria

- Import Memory Search menu is visible.
- Status API returns `search_status: READY`.
- Checklist API responds correctly.
- Test API returns `test_status: PASS`.
- Search API returns imported conversations.
- Results show summary queue and memory links when available.

## Next Phase

Phase 15-5 will extend the importer pipeline to Gemini and Claude export formats.
