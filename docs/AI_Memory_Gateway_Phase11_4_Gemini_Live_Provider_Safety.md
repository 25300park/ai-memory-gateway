# AI Memory Gateway - Phase 11-4 Gemini / Google Live Provider Safety

## Goal
Connect Gemini / Google provider through the same provider interface used by OpenAI and Anthropic, with a safety gate before any live API call.

## APIs

- GET `/ai/model/gemini/live-status`
- GET `/ai/model/gemini/available-models?limit=100`
- POST `/ai/model/gemini/live-test`

All APIs require `x-admin-token`.

## Required environment variables

Recommended safe default:

```env
AI_LIVE_MODE=false
GEMINI_LIVE_ENABLED=false
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_DEFAULT_MODEL=gemini-2.5-flash
GEMINI_LIVE_MAX_PROMPT_CHARS=12000
GEMINI_LIVE_TIMEOUT_MS=60000
GEMINI_MAX_OUTPUT_TOKENS=1500
GEMINI_LIVE_ALLOWED_MODELS=gemini-2.5-flash
```

Live test mode:

```env
AI_LIVE_MODE=true
GEMINI_LIVE_ENABLED=true
```

`GOOGLE_API_KEY` is also accepted as a fallback if `GEMINI_API_KEY` is not set.

## Postman live test body

```json
{
  "model_name": "gemini-2.5-flash",
  "prompt": "Reply with one short sentence confirming the Gemini live provider connection works.",
  "live": true
}
```

## Completion criteria

- Gemini Live Status returns `READY_FOR_LIVE_TEST` when enabled.
- Gemini dry-run returns `GEMINI_LIVE_DRY_RUN_READY`.
- Gemini available models are loaded with a valid key.
- Gemini live-test returns `GEMINI_LIVE_CALL_COMPLETED`.
- OpenAI and Anthropic provider tests still work.
