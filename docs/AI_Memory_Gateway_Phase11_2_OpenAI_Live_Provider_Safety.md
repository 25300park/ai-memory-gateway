# AI Memory Gateway - Phase 11-2 OpenAI Live Provider Safety

## Goal

Phase 11-2 connects the OpenAI provider to the AI Memory Gateway provider interface with explicit live-call safety gates.

## New Admin Console Controls

Menu: Model Providers

Added controls:

- Load OpenAI Live Status
- Run OpenAI Live Test
- OpenAI Live Test mode: dry-run or real live call
- OpenAI Live Safety Status panel

## New API

```txt
GET  /ai/model/openai/live-status
POST /ai/model/openai/live-test
```

Both APIs are protected by `x-admin-token`.

## Safety Gates

A real OpenAI call is blocked unless all are true:

```env
AI_LIVE_MODE=true
OPENAI_LIVE_ENABLED=true
OPENAI_API_KEY=...
```

Recommended optional limits:

```env
OPENAI_DEFAULT_MODEL=gpt-5.5-thinking
OPENAI_LIVE_MAX_PROMPT_CHARS=12000
OPENAI_LIVE_TIMEOUT_MS=60000
OPENAI_MAX_OUTPUT_TOKENS=1500
OPENAI_LIVE_ALLOWED_MODELS=gpt-5.5-thinking
```

If `OPENAI_LIVE_ALLOWED_MODELS` is empty, the selected OpenAI model is not restricted by environment variable. For production, restrict it.

## Postman: Status

```txt
GET http://localhost:3010/ai/model/openai/live-status
```

Header:

```txt
x-admin-token: AI_Basic_Zarvis_2026
```

## Postman: Dry Run

```txt
POST http://localhost:3010/ai/model/openai/live-test
```

Body:

```json
{
  "model_name": "gpt-5.5-thinking",
  "prompt": "Phase 11-2 OpenAI live provider dry-run test.",
  "live": false
}
```

Expected status:

```txt
OPENAI_LIVE_DRY_RUN_READY
```

## Postman: Real Live Call

Before running this, set `.env`:

```env
AI_LIVE_MODE=true
OPENAI_LIVE_ENABLED=true
OPENAI_API_KEY=your_key
OPENAI_LIVE_MAX_PROMPT_CHARS=12000
OPENAI_LIVE_TIMEOUT_MS=60000
OPENAI_MAX_OUTPUT_TOKENS=500
OPENAI_LIVE_ALLOWED_MODELS=gpt-5.5-thinking
```

Then restart the server.

Body:

```json
{
  "model_name": "gpt-5.5-thinking",
  "prompt": "Reply with one short sentence confirming the OpenAI live provider connection works.",
  "live": true
}
```

Expected status:

```txt
OPENAI_LIVE_CALL_COMPLETED
```

## Completion Criteria

- Model Providers screen loads
- OpenAI Live Status returns safety checklist
- Dry-run test works without API cost
- Real live test is blocked when safety gates are OFF
- Real live test works only when AI_LIVE_MODE and OPENAI_LIVE_ENABLED are ON
- Existing mock provider test remains working
- Existing AI Response Test remains working
