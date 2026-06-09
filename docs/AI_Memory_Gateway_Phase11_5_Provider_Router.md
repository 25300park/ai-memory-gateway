# AI Memory Gateway - Phase 11-5 Provider Router

## Goal

Phase 11-5 adds a provider routing layer that selects OpenAI, Anthropic, Gemini, or Mock based on:

- task intent
- preferred provider
- forced provider
- live safety gate status
- fallback availability
- model override

## Added APIs

```txt
GET  /ai/model/router/status
GET  /ai/model/router/rules
POST /ai/model/router/select
POST /ai/model/router/test
```

All APIs are protected with `x-admin-token`.

## Recommended .env

```env
AI_ROUTER_DEFAULT_PROVIDER=openai
AI_ROUTER_ALLOWED_PROVIDERS=openai,anthropic,google,mock
AI_ROUTER_FALLBACK_ENABLED=true
AI_ROUTER_REQUIRE_LIVE=false
```

## Postman Test

```txt
POST http://localhost:3010/ai/model/router/select
```

```json
{
  "intent": "reasoning",
  "preferred_provider": "openai",
  "prompt": "Phase 11-5 provider router selection test.",
  "live": false,
  "allow_fallback": true
}
```

Expected result:

```txt
route_status: SELECTED or SELECTED_WITH_WARNINGS
selected_provider: openai / anthropic / google / mock
selected_model: selected model id
```

## Admin Console

New menu:

```txt
Provider Router
```

The screen shows:

- Router Status
- Selected Provider
- Selected Model
- Provider Health Matrix
- Routing Trace
- Routing Rules
- Full Router JSON

## Completion Criteria

```txt
[ ] Provider Router menu visible
[ ] GET /ai/model/router/status works
[ ] GET /ai/model/router/rules works
[ ] POST /ai/model/router/select works
[ ] POST /ai/model/router/test works
[ ] Live safety gate affects provider selection
[ ] Fallback chain is shown
[ ] Existing OpenAI / Anthropic / Gemini tests still work
```
