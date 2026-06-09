# Phase 11-7A Runtime Fallback for AI Response Test

This supplement improves `/ai/response/test` runtime behavior.

## Problem
Provider Router could select a live provider successfully, but the actual provider call could still fail because of:
- invalid model id
- temporary provider outage
- quota/rate limit
- provider-side authentication issue

Before this patch, `/ai/response/test` returned `PROVIDER_CALL_FAILED` immediately.

## Improvement
If all conditions are true:
- `use_provider_router = true`
- `allow_fallback = true`
- `force_provider` is not set
- first provider call fails

then AI Response Test tries providers from `fallback_chain` until one succeeds.

The response now includes:
- `provider_router.runtime_fallback_applied`
- `provider_router.runtime_fallback_trace`
- `provider_router.final_provider`
- `provider_router.final_model`

If fallback succeeds, `response_status` becomes:

```txt
COMPLETED_WITH_RUNTIME_FALLBACK_PROVIDER
```

## Recommended Test
Use a preferred provider that may fail, keep fallback enabled:

```json
{
  "project_code": "rbs_ai_memory",
  "session_id": "phase-11-7a-runtime-fallback-test-001",
  "user_id": "admin-test-user",
  "question": "Reply with one short sentence confirming runtime fallback works.",
  "save_to_memory": true,
  "use_provider_router": true,
  "intent": "reasoning",
  "preferred_provider": "openai",
  "live": true,
  "allow_fallback": true,
  "use_assembly": true,
  "create_summary_queue": true
}
```
