# AI Memory Gateway - Phase 17-2

## Phase 17-2: Project Code Auto Detection

### Objective
Phase 17-2 improves the Personal AI Gateway Agent so that the user can ask a natural-language question without manually selecting a project every time.

The agent now detects the most likely `project_code` from the question, shows confidence and matched keywords, and stores detection metadata with the interaction.

### New / Updated Components

- `src/services/phase17-personal-agent.service.js`
- `src/routes/ai.routes.js`
- `src/public/admin/index.html`
- `docs/AI_Memory_Gateway_Phase17_2_Project_Code_Auto_Detection.md`

### New Database Table

```sql
personal_agent_project_rules
```

This table stores project detection rules.

Default seeded projects:

- `ai_memory_gateway`
- `rbs_homes`
- `runquest_ph`
- `philippines_franchise`
- `bgc_office_acquisition`

### Updated Table

`personal_agent_interactions` is extended with:

- `detection_confidence`
- `detection_reason`
- `matched_keywords`

### New APIs

```txt
GET  /ai/agent/project-detection/status
POST /ai/agent/detect-project
POST /ai/agent/project-detection/test
```

Existing APIs are upgraded to Phase 17-2:

```txt
GET  /ai/agent/status
GET  /ai/agent/projects
POST /ai/agent/ask
POST /ai/agent/test
```

### Admin Console

Menu:

```txt
Memory Operation → Personal AI Agent
```

Added functions:

- Detect Project
- Test Detection Rules
- Detection Confidence display
- Project Detection Details JSON output

### Postman Tests

#### Detection Status

```txt
GET http://localhost:3010/ai/agent/project-detection/status
```

Headers:

```txt
x-admin-token: AI_Basic_Zarvis_2026
```

#### Detect Project

```txt
POST http://localhost:3010/ai/agent/detect-project
```

Body:

```json
{
  "project_code": "auto",
  "question": "rbs-homes 카카오톡 매물 검색 기능 이어서 진행하겠습니다."
}
```

Expected example:

```json
{
  "ok": true,
  "detected_project_code": "rbs_homes",
  "confidence": 0.5,
  "detection_mode": "auto"
}
```

#### Detection Rule Test

```txt
POST http://localhost:3010/ai/agent/project-detection/test
```

Body:

```json
{}
```

Expected:

```txt
test_status: PASS
phase17_3_entry_allowed: true
```

#### Ask Agent

```txt
POST http://localhost:3010/ai/agent/ask
```

Body:

```json
{
  "project_code": "auto",
  "provider": "mock",
  "context_limit": 5,
  "question": "RunQuest PH PWA 다음 phase를 진행하겠습니다."
}
```

Expected:

```txt
detected_project_code: runquest_ph
provider_used: mock
saved: true
```

### Completion Criteria

- Personal AI Agent menu still loads.
- Project detection status is READY.
- Detect Project API returns the expected project code for sample questions.
- Detection rule test returns PASS.
- Ask Agent stores detection confidence and reason.
- `personal_agent_project_rules` table exists and contains seeded rules.
- `phase17_3_entry_allowed: true`.

### Next Phase

Phase 17-3: Memory Context Auto Search / Context Assembly
