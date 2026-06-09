# AI Memory Gateway - Phase 15-3

## Imported Conversation → Summary Queue Link

Phase 15-3 connects conversations imported from ChatGPT export ZIP files to the existing AI Memory Gateway summary pipeline.

## Purpose

Imported conversations should not only remain in raw storage. They must be linked to:

1. `ai_conversation_logs`
2. `ai_summary_queue`
3. `imported_conversation_links`
4. later `ai_memory` after the summary worker runs

This allows the existing summary worker to convert imported conversations into long-term memory.

## Admin Console Menu

Memory Operation → Import → Summary Queue

## API Endpoints

### Status

```http
GET /ai/imports/summary-queue-link/status
```

### Checklist

```http
GET /ai/imports/summary-queue-link/checklist
```

### Test

```http
POST /ai/imports/summary-queue-link/test
Content-Type: application/json

{
  "scenario": "current"
}
```

### Queue Imported Conversations

```http
POST /ai/imports/summary-queue-link/queue
Content-Type: application/json

{
  "project_code": "rbs_ai_memory",
  "limit": 3,
  "summary_model": "gpt-4o-mini"
}
```

## Recommended First Test

Start with a small limit:

```json
{
  "project_code": "rbs_ai_memory",
  "limit": 1,
  "summary_model": "gpt-4o-mini"
}
```

After confirming success, use limit 3, 10, or 50.

## Worker Command After Queueing

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:summary
```

For continuous processing:

```bash
npm run worker:summary:loop
```

## Database Flow

```txt
raw_imported_conversations
→ imported_conversation_messages
→ ai_conversation_logs
→ ai_summary_queue
→ summary worker
→ ai_memory
→ ai_memory_links
```

## Completion Criteria

- Summary Queue Link menu appears
- Status API returns READY or actionable checklist
- Test API returns PASS
- Queue API creates at least one `ai_summary_queue` item
- `raw_imported_conversations.summary_queue_id` is updated
- `imported_conversation_links` has summary_queue and conversation_log links
- Summary worker can process the queue into `ai_memory`

## Notes

Phase 15-3 does not summarize by itself. It prepares queue records so the existing summary worker can process imported conversations through the same long-term memory workflow used by live AI Gateway conversations.
