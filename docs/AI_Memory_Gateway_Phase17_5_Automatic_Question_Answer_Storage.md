# AI Memory Gateway - Phase 17-5

## Automatic Question / Answer Storage Hardening

Phase 17-5 upgrades the Personal AI Agent from a simple ask-and-save prototype into a durable conversation capture pipeline.

## Goal

Every Personal AI Agent request should be saved in a way that can be reused later.

The intended flow is:

```text
User question
→ project_code detection
→ memory context search
→ provider router / mock answer
→ personal_agent_interactions save
→ ai_conversation_logs save
→ optional ai_summary_queue enqueue
→ Summary Worker can later create ai_memory
```

## Updated service

```text
src/services/phase17-personal-agent.service.js
```

No route or Admin HTML overwrite is required for this phase. Existing Phase 17-3 / 17-4 endpoints are reused.

## Existing APIs used

```text
GET  /ai/agent/status
POST /ai/agent/ask
POST /ai/agent/test
```

## New / hardened DB columns

The service automatically adds these columns to `personal_agent_interactions` when missing:

```text
agent_session_id
agent_turn_no
conversation_log_id
summary_queue_id
auto_saved_to_conversation_log
auto_queued_for_summary
save_status
save_error
answer_summary
provider_model
provider_route_payload
provider_response_payload
provider_live_requested
provider_fallback_used
context_payload
used_context_sources
detection_confidence
detection_reason
matched_keywords
```

## Storage behavior

### Always saved

Each `/ai/agent/ask` request is saved into:

```text
personal_agent_interactions
```

### Saved when table exists

If `ai_conversation_logs` exists, the same interaction is also saved as a normal conversation log.

```text
ai_conversation_logs
```

### Optional summary queue

If the request payload includes:

```json
{
  "enqueue_summary": true
}
```

and `ai_summary_queue` exists, the newly saved conversation log is queued for the Summary Worker.

```text
ai_summary_queue
```

## Recommended Postman tests

### 1. Mock provider, save only

```http
POST http://localhost:3010/ai/agent/ask
```

```json
{
  "project_code": "auto",
  "provider": "mock",
  "context_limit": 5,
  "question": "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요."
}
```

Expected:

```text
ok: true
phase: 17-5
saved: true
storage.save_status: interaction_conversation_log_saved
```

### 2. Mock provider, save and queue summary

```json
{
  "project_code": "auto",
  "provider": "mock",
  "context_limit": 5,
  "enqueue_summary": true,
  "summary_model": "gpt-4o-mini",
  "question": "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요."
}
```

Expected:

```text
ok: true
phase: 17-5
storage.save_status: interaction_conversation_log_summary_queued
storage.summary_queue.ok: true
```

### 3. Provider auto, dry run

```json
{
  "project_code": "auto",
  "provider": "auto",
  "context_limit": 5,
  "live": false,
  "allow_fallback": true,
  "question": "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요."
}
```

Expected:

```text
provider_used: openai / anthropic / google / mock
saved: true
storage.save_status: interaction_conversation_log_saved
```

## DBeaver checks

```sql
SELECT id, agent_session_id, agent_turn_no, detected_project_code,
       provider_used, provider_model, conversation_log_id,
       summary_queue_id, save_status, created_at
FROM personal_agent_interactions
ORDER BY id DESC
LIMIT 20;
```

```sql
SELECT id, project_code, session_id, source_ai,
       conversation_title, model_name, status, created_at
FROM ai_conversation_logs
ORDER BY id DESC
LIMIT 20;
```

```sql
SELECT id, conversation_log_id, project_code, source_ai,
       summary_model, status, priority, created_at
FROM ai_summary_queue
ORDER BY id DESC
LIMIT 20;
```

## Summary Worker test

If `enqueue_summary=true` produced a pending queue item:

```bash
cd "/z/01. Ai_Memory_System/api"
npm run worker:summary
```

Then check:

```sql
SELECT *
FROM ai_memory
ORDER BY id DESC
LIMIT 20;
```

## Completion criteria

```text
[ ] /ai/agent/status shows phase 17-5
[ ] /ai/agent/ask succeeds with provider=mock
[ ] personal_agent_interactions row is created
[ ] ai_conversation_logs row is created
[ ] storage.save_status is visible in response
[ ] enqueue_summary=true creates ai_summary_queue row
[ ] Summary Worker can process the queued item
[ ] GitHub commit / push completed
```

## Next phase

Phase 17-6: Continue Project 기능.

The next phase should let the user choose or infer a project and ask the Agent to produce a compact "current state + next actions" response without repeating a long prompt.
