# 작업 원칙 (이 저장소 전용)

이 프로젝트는 ai-memory-gateway 백엔드입니다 (Express + Railway MySQL).

## 필수 절차
1. 코드 수정은 항상 diff를 먼저 보여주고 승인받은 뒤 커밋한다.
2. 실제 API 비용(Anthropic/OpenAI 호출)이 발생하는 작업 전에는 반드시 미리 알린다.
3. 큰 아키텍처 변경 전에는 범위를 좁히는 질문을 먼저 한다.
4. 코드 리뷰로 확인한 것과 실제로 재현/실행해서 확인한 것을 구분해서 보고한다.
5. 실패나 실수를 성공처럼 포장하지 않는다.

## 환경 참고사항
- 로컬 개발 시 여러 프로젝트 폴더가 존재하니, 작업 시작 전 
  `pwd`로 현재 위치가 이 저장소(ai-memory-gateway)가 맞는지 확인한다.
- DB는 현재 Railway MySQL을 기본으로 사용한다 (.env의 DB_HOST 확인).
- 인프라 상태가 의심되면 `node scripts/diagnose.js`로 먼저 진단한다.
- Windows 환경: PowerShell과 Git Bash의 경로 구분자(`\` vs `/`), 
  taskkill 옵션(`/PID` vs `//PID`) 문법이 다르다는 점 유의.

## 프로젝트 구조 참고
- 백엔드 핵심 로직: src/services/phase17-personal-agent.service.js
- provider 호출: src/services/model-provider.service.js
- eval 시스템: scripts/run-eval.js, score-eval.js, report-eval.js, weekly-eval.js
