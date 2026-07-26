# Phase 10 오케스트레이션 평가 문제 은행 (eval-question-bank)

## 목적

Phase 10: 오케스트레이션 정확도(라우팅, CRM/GitHub 조회, 지침서 반영, 로컬 모델 응답,
협업 루프, 오탐/회귀 방지)를 정기적으로 평가하기 위한 표준 문제 은행이다.

7개 카테고리(A~G) × 3문항, 총 21문항으로 구성되며, 이 문서의 문항 세트를 기준으로
매번 동일한 질문을 던져 응답을 비교함으로써 회귀 여부를 판단한다.

이 문제 은행은 이후 Phase 10-2(자동 실행 스크립트) 개발 시 실제로 사용될 예정이다.

## 문항 목록

| 번호 | 카테고리 | 질문 | 기대 결과 |
|----|------|------|----------|
| 1 | A. 라우팅 정확도 | "BGC 지역에 있는 임대 매물 찾아줘" | question_type=crm_query, CRM tool 발동 기대 |
| 2 | A. 라우팅 정확도 | "ai-memory-gateway에서 최근에 어떤 작업을 했어?" | question_type=dev_activity, GitHub tool 발동 기대 |
| 3 | A. 라우팅 정확도 | "오늘 서울 날씨 어때?" | CRM/GitHub 둘 다 미발동, 오탐 없음 기대 |
| 4 | B. CRM 사실 정확도 | "코드 L-2607-d861 매물 정보 알려줘" | 답변에 정확히 BGC Trion Tower 3 - Penthouse, 위치(8th Ave, McKinley Parkway, BGC), 가격(50000/월), 상태(ACTIVE)가 일치해야 함 |
| 5 | B. CRM 사실 정확도 | "임대 매물 중 가장 최근에 등록된 것 알려줘" | 실제 DB 최신순과 일치 |
| 6 | B. CRM 사실 정확도 | "매매 매물만 몇 건 있어?" | 실제 개수와 일치 |
| 7 | C. GitHub 조회 정확도 | "ai-memory-gateway 최근 커밋 5개 알려줘" | 실제 5개와 일치 |
| 8 | C. GitHub 조회 정확도 | "ai-assistant-console 저장소 최근 작업 알려줘" | 실제 커밋과 일치 |
| 9 | C. GitHub 조회 정확도 | "존재하지 않는 저장소(rbs_homes) 커밋 조회해줘" | 화이트리스트 거부 정상 작동 확인 |
| 10 | D. 지침서 반영 (project_code: rbs_homes_ops) | "매매 매물 가격은 어떻게 구분해?" | gross/net 언급 필수 |
| 11 | D. 지침서 반영 (project_code: rbs_homes_ops) | "매물 상태는 언제 바뀌어야 해?" | ACTIVE→COMPLETED 전환 규칙 언급 |
| 12 | D. 지침서 반영 (project_code: rbs_homes_ops) | "담당자 유형이 뭐가 있어?" | broker/agent/owner 언급 |
| 13 | E. LM Studio 로컬 답변 (provider=lmstudio) | "부동산 중개의 기본 개념을 설명해줘" | 합리적 답변, 응답시간 기록 |
| 14 | E. LM Studio 로컬 답변 (provider=lmstudio) | "간단한 인사말에 답해줘" | 정상 응답 |
| 15 | E. LM Studio 로컬 답변 (provider=lmstudio) | "임차인이 계약 기간 중 조기 해지를 요구할 때, 위약금 조항의 법적 유효성을 검토해줘" | 법률 전문가 상담을 권하며 스스로 한계를 인지하면 성공, 근거 없이 확신에 찬 법률 조언을 하면 실패 |
| 16 | F. 협업 루프 품질 | "매물 등록 절차를 정리한 문서 작성해줘" | writer-critic 라운드 진행, 응답 완결성(안 잘림) 확인 |
| 17 | F. 협업 루프 품질 | "짧은 한 줄 요약 요청" | 1라운드 만에 승인되는지 (과도한 반복 없는지) |
| 18 | F. 협업 루프 품질 | (16, 17 실행 결과에 대한 점검 항목) | reasoning_content가 실제로 검토 근거를 담고 있는지 확인 |
| 19 | G. 오탐/회귀 방지 | "매물 등록 코드 좀 고쳐줘" | CRM이 아니라 coding으로 분류되는지 확인 |
| 20 | G. 오탐/회귀 방지 | "안녕하세요" | 불필요하게 비싼 provider 안 쓰는지 (local 또는 저비용) |
| 21 | G. 오탐/회귀 방지 | (이미 있는 project_code가 아닌 것 질문) | 적절한 fallback/auto 감지 |

## 미해결 항목

- 이 문제 은행은 Phase 10-2(자동 실행 스크립트) 개발 시 실제로 사용될 예정이다.
