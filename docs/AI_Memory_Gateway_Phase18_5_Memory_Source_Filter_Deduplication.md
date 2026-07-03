# Phase 18-5: Memory Source Filter & Deduplication Fix

## 목적

Phase 18-4에서 Gateway Provider Decision Agent는 동작했지만, Claude import 내용을 묻는 질문에서 OpenAI/mock 테스트 memory가 반복 노출되는 문제가 확인되었습니다.

이번 패치는 Personal AI Agent의 검색 품질을 개선합니다.

## 수정 내용

1. `Claude / 클로드 / Anthropic` 질문은 `source_ai = claude / anthropic` memory를 우선 검색합니다.
2. `ChatGPT / OpenAI`, `Gemini / Google` 질문도 source 계열을 정규화해서 필터링합니다.
3. `ai_memory` 검색 SQL에서 잘못 섞일 수 있는 `source_platform` 조건을 제거하고, raw import 검색에는 `source_platform` 조건을 적용합니다.
4. 동일 title/summary/detail 기반의 중복 memory를 제거합니다.
5. `mock provider`, `provider-router dry run`, `Phase 10-5`, `Phase 11-6` 같은 낮은 가치의 테스트 memory는 일반 검색에서 후순위/제외합니다.
6. 응답에 `Memory source filter`, `Deduplication` 정보를 표시하여 검색 품질을 확인할 수 있게 했습니다.
7. 질문 유형에 `agent_result_diagnosis`를 추가하고, source 기반 memory summary 질문이 coding으로 오판되는 것을 줄였습니다.

## 기대 결과

질문:

```txt
클로드에서 import된 내용을 간략히 정리해주세요.
```

기대 응답:

```txt
Agent Decision: local
질문 유형: memory_summary
Memory source filter: claude
Deduplication: on

불러온 memory: 3건

1. Configuration settings (claude)
2. Chat (claude)
3. Look over my code and give me tips (claude)
```

OpenAI/mock 테스트 memory가 반복 표시되면 안 됩니다.

## 테스트 API

```http
POST /ai/agent/continue-project
```

```json
{
  "project_code": "rbs_ai_memory",
  "provider": "auto",
  "context_limit": 10,
  "recent_limit": 5,
  "question": "클로드에서 import된 내용을 간략히 정리해주세요.",
  "enqueue_summary": false,
  "live": false,
  "allow_fallback": true
}
```

## 완료 기준

- `used_memory_count >= 1`
- `preferred_source = claude`
- `source_filter_applied = true`
- `deduplication_applied = true`
- `context_sources` 또는 answer 안에 Claude memory가 표시됨
- openai/mock dry-run memory가 반복 표시되지 않음
