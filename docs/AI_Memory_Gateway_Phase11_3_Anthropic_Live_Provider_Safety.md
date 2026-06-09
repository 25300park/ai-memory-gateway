# AI Memory Gateway - Phase 11-3 Anthropic / Claude Live Provider Safety

## Goal

Phase 11-3 adds a guarded Anthropic / Claude live provider path to the existing multi-model provider interface.

The provider can run in two modes:

1. Dry-run / mock mode
2. Real Anthropic Messages API live call mode

## Added APIs

```txt
GET  /ai/model/anthropic/live-status
GET  /ai/model/anthropic/available-models?limit=100
POST /ai/model/anthropic/live-test
```

All APIs are protected by `x-admin-token`.

## Environment variables

Recommended default safe mode:

```env
AI_LIVE_MODE=false
ANTHROPIC_LIVE_ENABLED=false
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_VERSION=2023-06-01
ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-5
ANTHROPIC_LIVE_MAX_PROMPT_CHARS=12000
ANTHROPIC_LIVE_TIMEOUT_MS=60000
ANTHROPIC_MAX_OUTPUT_TOKENS=1500
ANTHROPIC_LIVE_ALLOWED_MODELS=claude-sonnet-4-5
```

Live test mode:

```env
AI_LIVE_MODE=true
ANTHROPIC_LIVE_ENABLED=true
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-5
ANTHROPIC_LIVE_ALLOWED_MODELS=claude-sonnet-4-5
```

Restart the server after changing `.env`.

## Admin Console

The existing `Model Providers` screen now includes:

- Load Anthropic Live Status
- Load Anthropic Models
- Run Anthropic Live Test
- Anthropic Live Gate status
- Anthropic API Key status

## Safety gate

A real Anthropic call only runs when all are true:

```txt
AI_LIVE_MODE=true
ANTHROPIC_LIVE_ENABLED=true
ANTHROPIC_API_KEY configured
Prompt length <= ANTHROPIC_LIVE_MAX_PROMPT_CHARS
Model is allowed if ANTHROPIC_LIVE_ALLOWED_MODELS is set
```

## Implementation note

This patch uses Node 22 native `fetch` to call the Anthropic Messages API directly, so no new npm package is required.

The API request uses:

```txt
POST https://api.anthropic.com/v1/messages
x-api-key: ANTHROPIC_API_KEY
anthropic-version: 2023-06-01 by default
content-type: application/json
```

## Test examples

### Status

```txt
GET http://localhost:3010/ai/model/anthropic/live-status
```

### Available models

```txt
GET http://localhost:3010/ai/model/anthropic/available-models?limit=100
```

### Dry run

```json
{
  "model_name": "claude-sonnet-4-5",
  "prompt": "Phase 11-3 Anthropic dry-run test.",
  "live": false
}
```

### Live test

```json
{
  "model_name": "claude-sonnet-4-5",
  "prompt": "Reply with one short sentence confirming the Claude live provider connection works.",
  "live": true
}
```

Expected success status:

```txt
ANTHROPIC_LIVE_CALL_COMPLETED
```

## Completion criteria

- Model Providers menu still loads
- Anthropic Live Status loads
- Anthropic dry-run test returns `ANTHROPIC_LIVE_DRY_RUN_READY`
- Live call is blocked when safety env vars are OFF
- Live call succeeds when safety env vars are ON and model id is valid
- Existing OpenAI live test still works
- Existing Provider Test works for openai / anthropic / mock
