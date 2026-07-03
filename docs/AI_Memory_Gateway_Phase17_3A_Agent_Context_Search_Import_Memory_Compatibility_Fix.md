# AI Memory Gateway - Phase 17-3A

## Agent Context Search Import Memory Compatibility Fix

This patch fixes Personal AI Agent memory context search compatibility with the actual `ai_memory` table schema.

### Problem

Claude imported conversations were correctly stored in `ai_memory`, but `/ai/agent/context-search` returned `used_memory_count: 0`.

The actual `ai_memory` columns are:

- `title`
- `summary`
- `detail`
- `tags`
- `source_ai`
- `project_code`
- `status`

The previous Personal Agent search logic could miss imported Claude memories because it relied on older/legacy text fields or strict keyword matching.

### Fix

`src/services/phase17-personal-agent.service.js` now:

1. Searches `ai_memory.title`, `ai_memory.summary`, `ai_memory.detail`, `ai_memory.tags`, and `ai_memory.source_ai`.
2. Supports project aliases:
   - `ai_memory_gateway` ↔ `rbs_ai_memory`
   - `rbs_homes` ↔ `sns_brokerage_automation`
3. Falls back to latest active project memories when keyword search returns no rows.
4. Includes Claude / ChatGPT / Gemini imported memories through `source_ai` and project alias search.
5. Returns `project_aliases`, `search_terms`, `sources`, and non-empty `context_summary` when memory exists.

### Test

```json
POST /ai/agent/context-search
{
  "project_code": "rbs_ai_memory",
  "question": "Claude에서 이야기했던 Admin에서 Agent 매물 관리 관련 내용을 이어서 설명해주세요.",
  "context_limit": 10
}
```

Expected:

```txt
ok: true
used_memory_count: 1 or more
sources include ai_memory or ai_memory_fallback_latest
```

### Apply

Overwrite:

```txt
src/services/phase17-personal-agent.service.js
```

Restart server:

```bash
npm run dev
```
