# AI Memory Gateway Phase 10-1

## Context Build API

Phase 10-1 adds the first real AI response pipeline preparation layer: Context Build.

The Context Build API combines three memory layers before an AI answer is generated:

1. Project Assets
2. Recent Buffer
3. Summarized Memory

## API

### POST /ai/context/build

Headers:

```txt
x-admin-token: ADMIN_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "project_code": "rbs_ai_memory",
  "session_id": "phase-10-1-test-001",
  "user_message": "Build a context packet for this question.",
  "include_text": true
}
```

Response:

```json
{
  "ok": true,
  "mode": "context_build",
  "project_code": "rbs_ai_memory",
  "session_id": "phase-10-1-test-001",
  "context_packet": {
    "layers": {
      "project_assets": [],
      "recent_buffer": [],
      "summarized_memory": []
    },
    "system_context_text": "...",
    "user_message": "...",
    "warnings": []
  },
  "summary": {
    "project_assets_count": 0,
    "recent_buffer_count": 0,
    "summarized_memory_count": 0,
    "ready_for_ai_request": true
  }
}
```

### GET /ai/context/build

Query example:

```txt
/ai/context/build?project_code=rbs_ai_memory&session_id=phase-10-1-test-001&user_message=hello
```

## Admin Console

A new menu item is added:

```txt
Context Build
```

The screen allows the operator to enter:

- Project Code
- Session ID
- User Message
- Include Text Packet

It displays:

- Project Assets Count
- Recent Buffer Count
- Summarized Memory Count
- Ready for AI Request
- System Context Text
- Full Context Packet JSON

## Phase 10-1 Completion Criteria

```txt
[ ] Context Build menu is visible
[ ] POST /ai/context/build works with x-admin-token
[ ] GET /ai/context/build works with x-admin-token
[ ] Context packet contains project_assets, recent_buffer, summarized_memory
[ ] System Context Text is generated
[ ] Admin screen displays summary cards and JSON output
[ ] Existing Context Preview / Context Rebuild still work
```
