# AI Memory Gateway - Phase 17-3

## Title
Memory Context Auto Search / Context Assembly Link

## Goal
Phase 17-3 upgrades the Personal AI Agent so that every question automatically searches project memory before generating an answer.

## Flow

1. User asks a natural-language question.
2. Agent detects `project_code` using Phase 17-2 project rules.
3. Agent searches memory context from:
   - `ai_memory`
   - `raw_imported_conversations`
4. Agent builds `context_summary` and `context_sources`.
5. Agent returns a mock answer with loaded context.
6. Agent saves the full interaction in `personal_agent_interactions`.

## New API

```txt
POST /ai/agent/context-search
POST /ai/agent/context-search/test
```

Existing APIs are also upgraded:

```txt
GET  /ai/agent/status
GET  /ai/agent/projects
POST /ai/agent/ask
POST /ai/agent/test
```

## Postman Test

```txt
POST http://localhost:3010/ai/agent/context-search
```

Body:

```json
{
  "project_code": "auto",
  "question": "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요.",
  "context_limit": 5
}
```

Expected:

```txt
ok: true
detected_project_code: ai_memory_gateway
context.used_memory_count: 0 or more
```

## Completion Criteria

- Agent detects project code.
- Agent searches memory context.
- Agent returns context preview.
- Ask Agent saves context payload.
- `personal_agent_interactions.context_payload` is populated.
- Phase 17-4 entry is allowed.
