# AI Memory Gateway Phase 10-2

## Context Preview Advanced

Phase 10-2 upgrades the existing Context Preview from a raw JSON output into an operator-friendly preview screen.

## Main additions

- Enhanced `POST /ai/context/preview`
- New `GET /ai/context/preview`
- Readiness status and readiness score
- Layer counts for Project Assets, Recent Buffer, and Summarized Memory
- Layer quality summary
- Extracted keyword preview
- Layer Cards output
- Final Prompt Preview
- Copy Final Prompt button
- Full Preview JSON output retained for debugging

## API

### POST /ai/context/preview

Headers:

```txt
x-admin-token: ADMIN_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "project_code": "rbs_ai_memory",
  "session_id": "phase-10-2-preview-test-001",
  "question": "Preview context layers before the actual AI response pipeline.",
  "include_prompt": true,
  "include_packet": true
}
```

### GET /ai/context/preview

```txt
/ai/context/preview?project_code=rbs_ai_memory&session_id=phase-10-2-preview-test-001&question=hello
```

## Readiness status

- `READY`: context layers and prompt are usable for the AI request pipeline.
- `READY_WITH_WARNINGS`: context can be used, but some layers are missing.
- `NOT_READY`: context is too weak for a real response pipeline test.

## Completion criteria

- Context Preview menu works.
- Readiness status and score are shown.
- Layer counts are shown.
- Layer Quality output is shown.
- Extracted Keywords output is shown.
- Layer Cards output is shown.
- Final Prompt Preview is shown.
- Copy Final Prompt works.
- Full Preview JSON is still available.
