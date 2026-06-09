# AI Memory Gateway - Phase 11-6

## Goal
Connect Provider Router to AI Response Test so actual response tests can select OpenAI, Anthropic, Gemini, or Mock providers through one routing layer.

## Added behavior

- AI Response Test now accepts routing options:
  - use_provider_router
  - intent
  - preferred_provider
  - force_provider
  - live
  - allow_fallback
- The service calls `selectProviderRoute()` before generating a response.
- The selected provider/model is executed through `testProviderAdapter()`.
- Conversation Logs, Recent Buffer, and Summary Queue use the routed provider/model.

## API

```http
POST /ai/response/test
```

Example:

```json
{
  "project_code": "rbs_ai_memory",
  "session_id": "phase-11-6-router-response-test-001",
  "user_id": "admin-test-user",
  "question": "Test AI Response with Provider Router.",
  "save_to_memory": true,
  "use_provider_router": true,
  "intent": "reasoning",
  "preferred_provider": "openai",
  "force_provider": "",
  "live": false,
  "allow_fallback": true,
  "use_assembly": true,
  "create_summary_queue": true
}
```

## Completion criteria

- AI Response Test runs with Provider Router enabled.
- `provider_router.route_status` is `SELECTED` or `SELECTED_WITH_WARNINGS`.
- Response shows selected provider/model.
- Dry-run works for OpenAI/Anthropic/Gemini/Mock.
- Live mode works when each provider safety gate is enabled.
- Conversation Log, Recent Buffer, and Summary Queue store the routed provider/model.
