# AI Memory Gateway - Phase 15-1 Imported Conversation Storage Table

## Objective

Phase 15-1 prepares storage for importing previous AI conversations from ChatGPT, Gemini, Claude, and manual text exports.

This phase does not parse ZIP exports yet. It creates and validates the database tables needed by later importers.

## New Admin Menu

Memory Operation → Imported Conversations

## New APIs

- GET `/ai/imports/conversations/status`
- GET `/ai/imports/conversations/checklist`
- POST `/ai/imports/conversations/test`

## New Tables

- `imported_conversation_batches`
- `raw_imported_conversations`
- `imported_conversation_messages`
- `imported_conversation_links`

## Storage Flow

1. Imported file is registered as a batch.
2. Raw conversation payload is stored in `raw_imported_conversations`.
3. Messages are normalized into `imported_conversation_messages`.
4. Later phases connect imported conversations to `ai_summary_queue` and `ai_memory`.

## Postman Test

GET `/ai/imports/conversations/status`

POST `/ai/imports/conversations/test`

```json
{
  "scenario": "current"
}
```

Optional insert test record:

```json
{
  "scenario": "insert_test_record",
  "project_code": "rbs_ai_memory"
}
```

## Completion Criteria

- Imported Conversations menu is visible.
- All four import storage tables are created.
- Status API returns `storage_status: READY`.
- Checklist API returns all required items.
- Test API returns `test_status: PASS`.

## Next Phase

Phase 15-2: ChatGPT Export ZIP Importer.
