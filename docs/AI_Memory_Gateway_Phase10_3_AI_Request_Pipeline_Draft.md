# AI Memory Gateway - Phase 10-3 AI Request Pipeline Draft

## Goal

Phase 10-3 creates a draft of the actual AI request pipeline before enabling live external AI execution.

The pipeline draft combines:

1. Project Assets
2. Recent Buffer
3. Summarized Memory
4. Context Preview quality
5. Model routing result
6. Final prompt
7. Request payload preview
8. Execution plan

No external AI model request is sent in this phase. This is intentional for operational safety.

## API

### POST /ai/request-pipeline/draft

Headers:

```txt
x-admin-token: ADMIN_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "project_code": "rbs_ai_memory",
  "session_id": "phase-10-3-pipeline-test-001",
  "question": "Create an AI request pipeline draft using memory context.",
  "dry_run": true,
  "include_prompt": true,
  "include_packet": true
}
```

### GET /ai/request-pipeline/draft

Example:

```txt
/ai/request-pipeline/draft?project_code=rbs_ai_memory&session_id=phase-10-3-pipeline-test-001&question=hello
```

## Admin Console

A new menu is added:

```txt
AI Pipeline Draft
```

The screen shows:

- Pipeline Status
- Selected Provider
- Selected Model
- Prompt Length
- Context Score
- Dry Run status
- Execution Plan
- Readiness & Warnings
- Request Payload Preview
- Full Pipeline Draft JSON

## Completion Criteria

- AI Pipeline Draft menu is visible.
- POST /ai/request-pipeline/draft returns JSON.
- GET /ai/request-pipeline/draft returns JSON.
- Model profile is selected by router.service.
- Context summary is included.
- Request payload preview is generated.
- Execution plan shows live model call as skipped in dry-run mode.
- Existing Context Build and Context Preview still work.

## Next Step

Phase 10-4 should improve production-oriented assembly by connecting Memory Search, Recent Buffer, and Project Assets into a safer context selection and trimming flow.
