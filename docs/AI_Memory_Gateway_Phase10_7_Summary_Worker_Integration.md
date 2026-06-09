# AI Memory Gateway - Phase 10-7 Summary Queue Worker Integration

## Goal

Phase 10-7 connects the response storage flow to the summary worker flow.

The intended pipeline is:

1. AI Response Test saves conversation logs.
2. AI Response Test creates a pending item in `ai_summary_queue`.
3. Summary Worker processes pending queue items.
4. Worker creates `conversation_summary` records in `ai_memory`.
5. Worker creates links in `ai_memory_links`.
6. Context Assembly can later retrieve these summaries as summarized memory.

## New Admin Menu

- Summary Worker

## New API Endpoints

```txt
GET  /ai/summary/worker-status
GET  /ai/summary/integration-status
POST /ai/summary/process-batch
POST /ai/summary/drain
```

All endpoints require `x-admin-token`.

## Worker Commands

```bash
npm run worker:summary
npm run worker:summary:loop
```

Optional environment variables:

```bash
SUMMARY_WORKER_BATCH_LIMIT=5
SUMMARY_WORKER_INTERVAL_MS=30000
SUMMARY_WORKER_PROJECT_CODE=rbs_ai_memory
```

## Postman Test

### Worker Status

```txt
GET http://localhost:3010/ai/summary/worker-status?project_code=rbs_ai_memory&limit=10
```

### Process One Batch

```txt
POST http://localhost:3010/ai/summary/process-batch
```

Body:

```json
{
  "project_code": "rbs_ai_memory",
  "limit": 5
}
```

### Drain Pending Queue

```txt
POST http://localhost:3010/ai/summary/drain
```

Body:

```json
{
  "project_code": "rbs_ai_memory",
  "limit_per_batch": 5,
  "max_batches": 3
}
```

## DBeaver Check

```sql
SELECT *
FROM ai_summary_queue
ORDER BY id DESC
LIMIT 20;
```

```sql
SELECT *
FROM ai_memory
WHERE memory_type = 'conversation_summary'
ORDER BY id DESC
LIMIT 20;
```

```sql
SELECT *
FROM ai_memory_links
ORDER BY id DESC
LIMIT 20;
```

## Completion Criteria

- Summary Worker menu is visible.
- Worker Status loads successfully.
- Process Batch converts pending queue to completed.
- `ai_memory` receives `conversation_summary` records.
- `ai_memory_links` links memory to conversation log.
- `npm run worker:summary` works.
- `npm run worker:summary:loop` works.
