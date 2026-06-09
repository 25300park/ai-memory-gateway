# AI Memory Gateway - Phase 11-1 Model Provider Interface

## Goal

Phase 11-1 introduces a normalized multi-model provider interface for OpenAI, Claude/Anthropic, Gemini/Google, and Mock Provider.

This phase does not force live provider calls. It creates a safe adapter layer so GPT / Claude / Gemini can share the same request/response shape before live SDK integration.

## Added APIs

```txt
GET  /ai/model/providers
GET  /ai/model/profiles/normalized
POST /ai/model/profile/normalize
POST /ai/model/provider/test
```

All APIs are protected by `x-admin-token`.

## Added files

```txt
src/services/model-provider.service.js
```

## Updated files

```txt
src/services/model.factory.js
src/routes/ai.routes.js
src/public/admin/index.html
src/public/admin/js/dashboard.js
src/public/admin/css/admin.css
```

## Provider status

| Provider | Phase 11-1 status |
|---|---|
| OpenAI | Adapter ready, live call controlled by AI_LIVE_MODE |
| Claude / Anthropic | Adapter contract ready, live SDK later |
| Gemini / Google | Adapter contract ready, live SDK later |
| Mock | Ready |

## Environment Variables

Optional:

```env
AI_LIVE_MODE=false
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
DEFAULT_MODEL=gpt-5.5-thinking
CLAUDE_DEFAULT_MODEL=claude-sonnet-4-5
GEMINI_DEFAULT_MODEL=gemini-2.5-pro
```

Recommended during Phase 11-1:

```env
AI_LIVE_MODE=false
```

## Test Order

1. Open Admin Console.
2. Click Model Providers.
3. Load Providers.
4. Load Normalized Profiles.
5. Run Provider Test in mock mode.
6. Confirm response shape is normalized.

## Postman Test

```txt
GET http://localhost:3010/ai/model/providers
```

```txt
GET http://localhost:3010/ai/model/profiles/normalized?include_inactive=true
```

```txt
POST http://localhost:3010/ai/model/provider/test
```

Body:

```json
{
  "provider": "openai",
  "model_name": "gpt-5.5-thinking",
  "prompt": "Phase 11-1 provider interface test.",
  "live": false
}
```

## Completion Criteria

```txt
[ ] Model Providers menu is visible
[ ] Provider catalog loads
[ ] Normalized model profiles load
[ ] Provider test returns MOCK_CALL_COMPLETED
[ ] model.factory uses normalized provider interface
[ ] Existing AI Response Test still works in mock mode
```
