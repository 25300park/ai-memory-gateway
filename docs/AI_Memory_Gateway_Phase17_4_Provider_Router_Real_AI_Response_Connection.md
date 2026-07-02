# AI Memory Gateway - Phase 17-4

## Title
Provider Router Connection / Real AI Response Link

## Goal
Phase 17-4 connects the Personal AI Agent to the existing Provider Router so that the agent can select OpenAI, Anthropic Claude, Google Gemini, or mock fallback after loading project memory context.

## What Changed

This patch primarily updates:

```txt
src/services/phase17-personal-agent.service.js
```

The existing route endpoints from Phase 17-1 to 17-3 continue to work:

```txt
GET  /ai/agent/status
GET  /ai/agent/projects
POST /ai/agent/context-search
POST /ai/agent/ask
POST /ai/agent/test
```

No route overwrite is required if `/ai/agent/ask` and `/ai/agent/context-search` already work.

## New Agent Flow

```txt
User question
→ project_code auto detection
→ memory context search
→ provider router selection
→ provider adapter execution
→ fallback to mock when needed
→ save interaction with context + provider trace
```

## New / Extended Columns

The service auto-adds these columns to `personal_agent_interactions` when missing:

```txt
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

## Safe Mode vs Live Mode

By default, provider execution is safe. If `live` is omitted or false, provider adapters may return dry-run/mock output depending on the existing Phase 11 provider configuration.

Live execution requires the existing live provider safety gates:

```txt
AI_AGENT_LIVE_MODE=true      # optional agent-level live flag
AI_LIVE_MODE=true            # global live flag
OPENAI_LIVE_ENABLED=true     # for OpenAI live call
OPENAI_API_KEY=...
```

Anthropic/Gemini live behavior depends on the current project provider adapter implementation. If a live call fails, the agent falls back to mock when `allow_fallback` is true.

## Postman Test - Safe Router Mode

```txt
POST http://localhost:3010/ai/agent/ask
```

Body:

```json
{
  "project_code": "auto",
  "provider": "auto",
  "context_limit": 5,
  "question": "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요.",
  "live": false,
  "allow_fallback": true
}
```

Expected:

```txt
ok: true
phase: 17-4
provider_requested: auto
provider_used: openai / anthropic / google / mock
provider_model: returned
saved: true
```

## Postman Test - Force Mock

```json
{
  "project_code": "auto",
  "provider": "mock",
  "context_limit": 5,
  "question": "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요."
}
```

Expected:

```txt
provider_used: mock
saved: true
```

## Postman Test - Force OpenAI Dry Run

```json
{
  "project_code": "auto",
  "provider": "openai",
  "context_limit": 5,
  "question": "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요.",
  "live": false,
  "allow_fallback": true
}
```

Expected:

```txt
provider_used: openai or mock fallback
provider_model: returned
saved: true
```

## Live Test Caution

Only run live mode after confirming API keys and provider safety settings.

```json
{
  "project_code": "auto",
  "provider": "openai",
  "context_limit": 5,
  "question": "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요.",
  "live": true,
  "allow_fallback": true
}
```

If live mode is not configured, fallback to mock is acceptable for Phase 17-4.

## Completion Criteria

- `/ai/agent/status` returns phase `17-4`.
- `/ai/agent/ask` works with `provider=mock`.
- `/ai/agent/ask` works with `provider=auto`.
- Provider route status/model are returned.
- Interaction is saved in `personal_agent_interactions`.
- Provider route/response payloads are stored.
- Fallback works when live provider execution fails.
- Phase 17-5 entry is allowed.
