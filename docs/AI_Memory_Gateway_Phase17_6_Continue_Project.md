# AI Memory Gateway - Phase 17-6

## Continue Project Feature

Phase 17-6 adds a project-continuation workflow to the Personal AI Agent.

## Goal

The user should be able to write a simple continuation request such as:

```text
AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 현재 상태와 다음 단계 알려주세요.
```

The agent then:

```text
1. Detects the project_code
2. Loads relevant ai_memory and imported conversation context
3. Loads recent Personal Agent interactions
4. Loads recent ai_conversation_logs
5. Builds a continuation prompt
6. Calls the selected provider or mock fallback
7. Saves the new turn through the Phase 17-5 storage pipeline
```

## Updated file

```text
src/services/phase17-personal-agent.service.js
```

## Optional route/UI merge files

```text
src/routes/ai.routes.js
src/public/admin/index.html
```

These are provided as merge helpers. If your current files contain many existing routes or UI blocks, merge the Phase 17-6 route/UI block rather than blindly replacing the whole file.

## New APIs

```text
POST /ai/agent/continue-project
POST /ai/agent/continue-project/test
```

## Test request

```json
{
  "project_code": "auto",
  "provider": "mock",
  "context_limit": 8,
  "recent_limit": 5,
  "question": "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 현재 상태와 다음 단계 알려주세요.",
  "enqueue_summary": false,
  "live": false,
  "allow_fallback": true
}
```

## Expected result

```text
ok: true
phase: 17-6
continue_status: READY
detected_project_code: ai_memory_gateway
recent_interaction_count: 0 or more
recent_log_count: 0 or more
response.saved: true
```

## Completion criteria

```text
[ ] /ai/agent/continue-project/test passes
[ ] /ai/agent/continue-project returns phase 17-6
[ ] Project code is detected automatically
[ ] Memory context is loaded
[ ] Recent Personal Agent interactions are loaded
[ ] Recent conversation logs are loaded
[ ] New answer is saved through Phase 17-5 storage pipeline
[ ] GitHub commit / push complete
```
