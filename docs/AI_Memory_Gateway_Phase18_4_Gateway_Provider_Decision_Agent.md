# AI Memory Gateway - Phase 18-4 Gateway Provider Decision Agent

## Purpose

Phase 18-4 upgrades the Personal AI Agent from a simple provider selector into a balanced Gateway Agent.

When the user asks a question, the Agent now:

1. Detects the project.
2. Searches stored memory.
3. Classifies the question type.
4. Decides whether local memory is enough.
5. Selects OpenAI, Claude, Gemini, local memory, or mock mode.
6. Records the decision in the response and interaction payload.
7. Shows the decision in the Admin Console before or alongside the answer.

## Balanced Strategy

The default strategy is balanced:

- Stored memory summaries use local memory answer first to save tokens.
- Coding, API, patch, bug, SQL, and long code questions prefer Claude.
- Business strategy, analysis, and planning questions prefer OpenAI.
- Google/Gemini-specific questions prefer Gemini.
- User-selected providers override automatic provider selection.
- Live external calls only happen when `live=true` and the Gateway decision allows it.

## Main Backend Changes

File:

```txt
src/services/phase17-personal-agent.service.js
```

Added:

- `inferGatewayQuestionType()`
- `buildGatewayProviderDecision()`
- `buildProviderDecisionAnswer()`
- gateway decision payload in Agent responses
- optional DB columns for decision logging

New decision fields returned by `/ai/agent/ask` and `/ai/agent/continue-project` include:

```json
{
  "gateway_decision": {
    "strategy": "balanced",
    "question_type": "memory_summary",
    "selected_provider": "local",
    "live_call_recommended": false,
    "live_call_requested": false,
    "live_call_allowed": false,
    "estimated_cost_level": "zero",
    "decision_reason": "..."
  }
}
```

## Admin UI Changes

File:

```txt
src/public/admin/index.html
```

Added:

- Provider default changed to `Balanced Gateway Agent`.
- Local memory-only option added.
- Agent Run Summary now shows:
  - Question Type
  - Selected Provider
  - Live Decision
  - Cost Level
- New `Agent Decision` panel shows the full decision JSON.

## Test

1. Start server:

```bash
cd "/z/01. Ai_Memory_System/api"
npm run dev
```

2. Open Admin:

```txt
http://localhost:3010/admin?token=AI_Basic_Zarvis_2026
```

3. Go to `Personal AI Agent`.

4. Keep provider as `Balanced Gateway Agent` and Live provider unchecked.

5. Ask:

```txt
클로드에서 import된 내용을 간략히 정리해주세요.
```

Expected:

- Selected Provider: `local`
- Question Type: `memory_summary`
- Cost Level: `zero`
- Live Decision: `local/no live`
- Answer should be based on stored Claude memory.

6. Ask a coding question:

```txt
이 코드 오류를 분석하고 패치 방향을 알려주세요.
```

Expected:

- Selected Provider: `anthropic`
- Question Type: `coding`
- Live Decision: `recommended but off` if live is unchecked

To actually call the selected external provider, enable `Live provider` after API keys are configured.
