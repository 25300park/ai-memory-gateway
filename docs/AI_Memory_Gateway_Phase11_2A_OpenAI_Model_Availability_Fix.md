# Phase 11-2A OpenAI Model Availability Fix

## Problem

Live OpenAI test reached the OpenAI API, but returned:

```txt
400 The requested model `gpt-5.5-thinking` does not exist.
```

This means local safety gates passed, but the selected model id is invalid or unavailable to the current OpenAI API key/project.

## Fix

- Default OpenAI model changed from `gpt-5.5-thinking` to `gpt-5.5`.
- Added structured OpenAI model-not-available handling.
- Added API to list models visible to the current API key.

```txt
GET /ai/model/openai/available-models?limit=100
```

## Recommended .env

```env
AI_LIVE_MODE=true
OPENAI_LIVE_ENABLED=true
OPENAI_DEFAULT_MODEL=gpt-5.5
OPENAI_LIVE_ALLOWED_MODELS=gpt-5.5
```

If `gpt-5.5` is not visible in available models, use a model id returned by `/available-models`.
