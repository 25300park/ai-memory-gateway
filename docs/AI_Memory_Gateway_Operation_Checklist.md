# AI Memory Gateway Operation Checklist

문서명: AI_Memory_Gateway_Operation_Checklist.md  
프로젝트: mrHOMES / RBS AI Memory Gateway  
Phase: 5C-7 운영 점검 체크리스트  
목적: NAS + MariaDB + Node.js 기반 AI Memory Gateway의 운영 상태를 매일/매주 점검하기 위한 기준 문서

---

## 1. 기본 실행 경로 (Git Bahs)

```Bash
cd /z/ai_memory_system/api

```

## 2. API 서버 실행

```Bash
npm run dev

    정상 실행 예시:

        AI Memory Gateway running on port 3010

    확인할 항목:

        DB_HOST 표시 여부
        DB_PORT 표시 여부
        DB_NAME 표시 여부
        DB_USER 표시 여부
        DB_PASSWORD exists = true 표시 여부
        OPENAI_API_KEY exists 여부
        서버 포트 3010 실행 여부

        주의:

        비밀번호, API Key 원문이 콘솔에 출력되면 안 된다.       

```

## 3. Summary Loop Worker 실행

```Bash
npm run worker:summary:loop

    정상 기준:

        30초마다 pending queue를 확인한다.
        pending 항목이 있으면 summary.worker.js가 처리한다.
        처리 완료 후 ai_memory에 저장된다.
        ai_memory_links에 원문 로그와 memory 연결이 생성된다.
        ai_summary_queue status가 completed로 변경된다.

```

## 4. 기본 Health Check

### 4-1. API 서버 상태 확인

```bash 아니고 Postman
GET : npm run worker:summary:loop

    정상 응답 예시:
    
        {
        "success": true,
        "message": "AI Memory Gateway is running"
        }

        체크 항목:
        success가 true인지 확인
        서버 응답 시간이 과도하게 느리지 않은지 확인
        404 또는 500 오류가 없는지 확인

```
### 4-2. DB 연결 상태 확인

```bash 아니고 Postman
GET : http://localhost:3010/health/db

    정상 기준:

    DB 연결 성공
    MariaDB 응답 정상
    timeout 없음
    access denied 없음

    문제 발생 시 확인:

    NAS MariaDB 실행 여부
    192.168.0.5 접속 가능 여부
    .env DB 정보 확인
    rbs_app 계정 권한 확인

```

## 5. System Status 점검

```bash 아니고 Postman
GET : http://localhost:3010/ai/system/status

    확인 항목:

    API 서버 상태
    DB 상태
    주요 테이블 존재 여부
    memory count
    queue count
    pending / failed queue 수
    project count
    asset count

    운영 기준:

    failed queue가 계속 증가하면 안 된다.
    pending queue가 장시간 남아 있으면 안 된다.
    DB 연결 오류가 없어야 한다.

```

## 6. Summary Queue 점검

```bash 아니고 Postman
GET : http://localhost:3010/ai/summary/queue

    확인 항목:

    pending
    processing
    completed
    failed

    정상 기준:

    pending 항목은 worker 실행 후 completed로 변경되어야 한다.
    failed 항목은 원인을 확인한 뒤 retry해야 한다

```

## 7. DBeaver에서 Queue 상태 확인 SQL

```bash 아니고 DBeaver에서 rbs_viber DB 접속 후 실행
    </> SQL
        SELECT 
        status,
        COUNT(*) AS count
        FROM ai_summary_queue
        GROUP BY status;

최근 queue 확인:

SELECT 
  id,
  conversation_log_id,
  status,
  retry_count,
  error_message,
  created_at,
  updated_at
FROM ai_summary_queue
ORDER BY id DESC
LIMIT 20;

failed queue 확인:

SELECT 
  id,
  conversation_log_id,
  status,
  retry_count,
  error_message,
  created_at,
  updated_at
FROM ai_summary_queue
WHERE status = 'failed'
ORDER BY id DESC;


8. Failed Queue 재시도 방법

API 사용:

POST http://localhost:3010/ai/summary/retry-failed

정상 기준:

failed 상태의 queue가 pending으로 변경된다.
worker가 다시 처리한다.
성공 시 completed로 변경된다.

재시도 후 DBeaver 확인:

SELECT 
  id,
  status,
  retry_count,
  error_message,
  updated_at
FROM ai_summary_queue
ORDER BY id DESC
LIMIT 20;
9. Recent Buffer 점검

recent buffer는 session별 최근 대화만 유지한다.

확인 SQL:

SELECT 
  id,
  project_code,
  session_id,
  role,
  LEFT(content, 120) AS content_preview,
  created_at
FROM ai_recent_buffer
ORDER BY id DESC
LIMIT 30;

session별 개수 확인:

SELECT 
  session_id,
  COUNT(*) AS buffer_count
FROM ai_recent_buffer
GROUP BY session_id
ORDER BY buffer_count DESC;

운영 기준:

session별 recent buffer가 과도하게 쌓이면 안 된다.
현재 기준은 session별 최대 10개 유지이다.
오래된 buffer가 자동 정리되는지 확인한다.
10. Conversation Log 저장 점검
SELECT 
  id,
  project_code,
  session_id,
  user_input,
  model_response,
  created_at
FROM ai_conversation_logs
ORDER BY id DESC
LIMIT 10;

확인 항목:

/ai/ask 호출 후 user_input 저장 여부
Mock response 저장 여부
project_code 저장 여부
session_id 저장 여부
created_at 정상 입력 여부
11. Memory 저장 점검
SELECT 
  id,
  project_code,
  memory_type,
  status,
  LEFT(content, 150) AS content_preview,
  source_type,
  created_at
FROM ai_memory
ORDER BY id DESC
LIMIT 20;

확인 항목:

Summary Worker 처리 후 ai_memory 생성 여부
수동 저장 API 사용 후 ai_memory 생성 여부
status 값이 active / archived / deleted 등 표준값인지 확인
중복 memory가 과도하게 생성되지 않는지 확인
12. Memory Link 점검
SELECT 
  id,
  memory_id,
  conversation_log_id,
  created_at
FROM ai_memory_links
ORDER BY id DESC
LIMIT 20;

확인 항목:

summary로 생성된 memory가 원문 conversation_log와 연결되는지 확인
memory_id와 conversation_log_id가 정상 연결되는지 확인
13. Context Preview 점검

Postman에서 실행:

POST http://localhost:3010/ai/context/preview

Body 예시:

{
  "project_code": "rbs_ai_memory",
  "session_id": "test-session-001",
  "message": "AI Memory Gateway의 운영 상태를 점검하고 싶습니다."
}

확인 항목:

project_assets 포함 여부
recent_buffer 포함 여부
long_term_memory 검색 여부
keyword 추출 여부
score 기반 ranking 작동 여부
14. Context Rebuild 점검
POST http://localhost:3010/ai/context/rebuild

Body 예시:

{
  "project_code": "rbs_ai_memory",
  "session_id": "test-session-001"
}

확인 항목:

특정 session 기준 context 재구성 가능 여부
recent buffer와 long-term memory가 정상 조합되는지 확인
오류 발생 시 memory.service.js와 context.service.js 확인
15. Project Assets 점검

프로젝트 asset 조회:

GET http://localhost:3010/ai/project/rbs_ai_memory/assets

asset type 목록 조회:

GET http://localhost:3010/ai/assets/types

확인 항목:

persona
rule
vocabulary
workflow
formatting
reference_doc

DBeaver 확인 SQL:

SELECT 
  id,
  project_code,
  asset_type,
  title,
  status,
  created_at,
  updated_at
FROM project_assets
ORDER BY id DESC;

운영 기준:

project_assets는 AI 응답 품질을 결정하는 핵심 기준이다.
불필요한 asset은 archived 처리한다.
같은 내용이 중복 저장되지 않도록 관리한다.
16. Project List 점검
GET http://localhost:3010/ai/project/list

확인 항목:

ai_projects 목록 조회 여부
project_code 확인
project_name 확인
status 확인

DBeaver SQL:

SELECT 
  id,
  project_code,
  project_name,
  status,
  created_at,
  updated_at
FROM ai_projects
ORDER BY id DESC;
17. 중복 저장 방지 테스트

수동 memory 저장 API:

POST http://localhost:3010/ai/memory/save

Body 예시:

{
  "project_code": "rbs_ai_memory",
  "memory_type": "operation_note",
  "content": "Phase 5C 운영 점검 체크리스트 작성 완료",
  "source_type": "manual"
}

같은 내용을 2번 저장 테스트한다.

정상 기준:

완전히 같은 memory가 무제한 중복 저장되면 안 된다.
중복 방지 로직이 작동해야 한다.
응답 메시지 또는 DB 상태를 확인한다.

확인 SQL:

SELECT 
  project_code,
  memory_type,
  content,
  COUNT(*) AS duplicate_count
FROM ai_memory
GROUP BY project_code, memory_type, content
HAVING COUNT(*) > 1;
18. .env 보안 점검

확인 파일:

Z:\ai_memory_system\api\.env
Z:\ai_memory_system\api\.env.example
Z:\ai_memory_system\api\.gitignore
.env 확인 항목

.env에는 실제 값이 들어간다.

예시:

DB_HOST=192.168.0.5
DB_PORT=3306
DB_NAME=rbs_viber
DB_USER=rbs_app
DB_PASSWORD=실제비밀번호
OPENAI_API_KEY=실제키
PORT=3010

주의:

.env 파일은 외부 공유 금지
GitHub 업로드 금지
콘솔 로그에 실제 비밀번호 출력 금지
API Key 원문 출력 금지
.env.example 확인 항목

.env.example에는 샘플 값만 들어간다.

DB_HOST=your_db_host
DB_PORT=3306
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
OPENAI_API_KEY=your_openai_api_key
PORT=3010
.gitignore 확인 항목

.gitignore에 반드시 포함:

node_modules/
.env
*.log
19. 자주 발생하는 에러와 해결 방법
19-1. EADDRINUSE

원인:

3010 포트가 이미 사용 중이다.

확인:

netstat -ano | findstr :3010

종료:

cmd.exe /c taskkill /PID <PID> /F

그 후 다시 실행:

npm run dev
19-2. connect ETIMEDOUT

원인 후보:

NAS 접속 불가
MariaDB 미실행
IP 변경
방화벽 문제
DB timeout 설정 부족

확인:

GET http://localhost:3010/health/db

점검:

NAS IP가 192.168.0.5인지 확인
MariaDB 서비스 실행 여부 확인
DBeaver 접속 여부 확인
src/config/db.js timeout 설정 확인
19-3. BigInt JSON error

원인:

MariaDB BIGINT 값이 JSON으로 변환되지 않음.

app.js에 아래 코드가 있어야 한다.

app.set("json replacer", (key, value) =>
  typeof value === "bigint" ? value.toString() : value
);
19-4. Cannot find module

원인:

파일 경로 오류
require 경로 오류
npm install 누락
파일명 오타

확인:

npm install

문법 확인:

node --check src/app.js
node --check src/server.js
node --check src/routes/ai.routes.js
19-5. router is not defined

원인:

service 파일에 router.get / router.post / router.patch 코드를 넣은 경우.

기준:

router 코드는 src/routes/ai.routes.js에만 작성
DB 함수는 src/services/memory.service.js에 작성
모델 응답 함수는 src/services/model.factory.js에 작성
시스템 상태 함수는 src/services/system.service.js에 작성
19-6. searchMemory is not defined

원인:

함수 export/import 불일치.

확인 파일:

src/services/memory.service.js
src/routes/ai.routes.js
src/services/context.service.js

memory.service.js의 module.exports에 searchMemory가 포함되어야 한다.

19-7. Unexpected end of input

원인:

중괄호, 괄호, 함수 닫기 누락.

확인:

node --check src/services/memory.service.js
node --check src/routes/ai.routes.js
node --check src/app.js
20. 일일 운영 점검 순서

매일 작업 시작 전 아래 순서로 점검한다.

Step 1. API 서버 실행
cd /z/ai_memory_system/api
npm run dev
Step 2. Summary Worker 실행

새 Git Bash 창:

cd /z/ai_memory_system/api
npm run worker:summary:loop
Step 3. Health Check
GET /health
GET /health/db
Step 4. System Status 확인
GET /ai/system/status
Step 5. Summary Queue 확인
GET /ai/summary/queue
Step 6. failed queue 확인
SELECT * 
FROM ai_summary_queue
WHERE status = 'failed'
ORDER BY id DESC;
Step 7. Recent Buffer 확인
SELECT 
  session_id,
  COUNT(*) AS count
FROM ai_recent_buffer
GROUP BY session_id;
Step 8. 최근 memory 확인
SELECT 
  id,
  project_code,
  memory_type,
  status,
  LEFT(content, 100) AS preview,
  created_at
FROM ai_memory
ORDER BY id DESC
LIMIT 10;
Step 9. 테스트 질문 1회 실행
POST /ai/ask

Body 예시:

{
  "project_code": "rbs_ai_memory",
  "session_id": "daily-check-session",
  "message": "오늘 AI Memory Gateway 운영 상태를 점검합니다."
}
Step 10. 저장 결과 확인
ai_conversation_logs 저장 여부
ai_recent_buffer 저장 여부
ai_summary_queue pending 생성 여부
worker 처리 후 ai_memory 저장 여부
21. 주간 운영 점검 순서

매주 1회 아래 항목을 점검한다.

21-1. Memory 중복 확인
SELECT 
  project_code,
  memory_type,
  content,
  COUNT(*) AS duplicate_count
FROM ai_memory
GROUP BY project_code, memory_type, content
HAVING COUNT(*) > 1;
21-2. 오래된 failed queue 확인
SELECT 
  id,
  status,
  retry_count,
  error_message,
  created_at
FROM ai_summary_queue
WHERE status = 'failed'
ORDER BY created_at ASC;
21-3. project_assets 정리
SELECT 
  project_code,
  asset_type,
  status,
  COUNT(*) AS count
FROM project_assets
GROUP BY project_code, asset_type, status;
21-4. 비활성 memory 확인
SELECT 
  status,
  COUNT(*) AS count
FROM ai_memory
GROUP BY status;
21-5. DB 테이블별 데이터 증가 확인
SELECT 'ai_conversation_logs' AS table_name, COUNT(*) AS count FROM ai_conversation_logs
UNION ALL
SELECT 'ai_recent_buffer', COUNT(*) FROM ai_recent_buffer
UNION ALL
SELECT 'ai_memory', COUNT(*) FROM ai_memory
UNION ALL
SELECT 'ai_summary_queue', COUNT(*) FROM ai_summary_queue
UNION ALL
SELECT 'project_assets', COUNT(*) FROM project_assets;
22. 운영 완료 기준

Phase 5C-7 완료 기준:

운영 체크리스트 문서가 docs 폴더에 생성되어 있다.
API 서버 실행 방법이 정리되어 있다.
Summary Worker 실행 방법이 정리되어 있다.
Health Check 방법이 정리되어 있다.
System Status 점검 방법이 정리되어 있다.
Queue / Memory / Recent Buffer 점검 SQL이 포함되어 있다.
자주 발생하는 오류와 해결 방법이 포함되어 있다.
일일 점검 순서가 포함되어 있다.
주간 점검 순서가 포함되어 있다.
.env 보안 점검 기준이 포함되어 있다.

---

# 25. 운영 점검 방식: 수동 점검과 자동화 방향

## 25-1. 운영 체크리스트의 목적

이 문서는 매일/매주 사람이 직접 모든 항목을 수동으로 입력하기 위한 문서가 아니다.

이 문서의 핵심 목적은 다음과 같다.

1. AI Memory Gateway 운영자가 반드시 확인해야 할 항목을 정의한다.
2. API 서버, DB, Summary Worker, Memory 저장 상태를 점검하는 기준을 정리한다.
3. 장애 발생 시 어떤 순서로 원인을 확인할지 기준을 제공한다.
4. 향후 자동 점검 스크립트를 만들 때 검사 항목의 기준서로 사용한다.

즉, 이 문서는 다음 역할을 한다.


```text
AI_Memory_Gateway_Operation_Checklist.md
= 운영 점검 기준서
= 수동 점검 매뉴얼
= 자동화 스크립트 설계 기준 문서


```/ai/ask Body
| POST /ai/ask | OK | Request succeeded after using required field "question" instead of "message". |
| ai_conversation_logs Save | OK | Conversation log saved for session_id phase-5c-final-test-001. |
| ai_recent_buffer Save | OK | Recent buffer saved for session_id phase-5c-final-test-001. |


```conversation log 
| ai_conversation_logs Save | OK | Conversation log saved for session_id phase-5c-final-test-001. |


```recent
| ai_recent_buffer Table Structure | OK | DESCRIBE confirmed actual message column. content column does not exist. |
| ai_recent_buffer Save | OK | Recent buffer saved for session_id phase-5c-final-test-001. DESCRIBE confirmed the actual content column is message, not content. |


```ai_summary_queue
| ai_summary_queue Check | CHECK_REQUIRED | Initial SQL failed because retry_count column does not exist. Retesting with SELECT * query. |


```ai_memorry_save
| ai_memory Save | OK | Summary worker processed queue and saved memory into ai_memory. |


```ai_memory_links
| ai_memory_links Save | OK | Memory link created between ai_memory and ai_conversation_logs. Latest link_type is summary_of. |


```ai_context_preview
| POST /ai/context/preview | OK | Context preview returned recent buffer, long-term memory, and project assets for session_id phase-5c-final-test-001. |


```ai_memory_search
| GET /ai/memory/search | CHECK_REQUIRED | Initial request failed because SQL text was entered in Postman JSON body. Retesting with empty body is required. |


```Duplicate_save
| Duplicate Save Prevention | OK | Duplicate memory save test completed using title and summary fields. duplicate_count = 1. |


```ai_summary
| POST /ai/summary/retry-failed | OK | Retry failed summary queue API responded successfully. |


```Project_Assets
| Project Assets DB Check | OK | project_assets table was queried successfully. |

```env_파일확인
| .env Security Check | OK | .env, .env.example, and .gitignore exist as hidden/config files. .gitignore includes .env, .env.example contains sample values only, and server logs do not print sensitive values. |


---

# Phase 5C Final Check Result

점검일: 2026-05-25

## Final Check Items

| Item | Result | Note |
|---|---|---|
| API Server Run | OK | API server started and responded through Postman. Previous EADDRINUSE issue was resolved. |
| GET /health | OK | Health check endpoint confirmed. |
| GET /health/db | OK | Database health check confirmed. |
| POST /ai/ask | OK | Request succeeded after using required field "question" instead of "message". |
| ai_conversation_logs Save | OK | Conversation log saved for session_id phase-5c-final-test-001. |
| ai_recent_buffer Save | OK | Recent buffer saved for session_id phase-5c-final-test-001. DESCRIBE confirmed the actual content column is "message", not "content". |
| ai_summary_queue Create | OK | Summary queue was created after /ai/ask. SQL was adjusted because retry_count column does not exist. |
| Summary Worker Queue Process | OK | Summary worker processed queue and changed status successfully. |
| ai_memory Save | OK | Summary worker processed queue and saved memory into ai_memory. |
| ai_memory_links Save | OK | Memory link created between ai_memory and ai_conversation_logs. Latest link_type confirmed as summary_of. |
| POST /ai/context/preview | OK | Context preview returned recent buffer, long-term memory, and project context. |
| GET /ai/memory/search | OK | Memory search API responded successfully after sending GET request with empty body. |
| Duplicate Save Prevention | OK | Duplicate memory save test completed using title and summary fields. duplicate_count = 1. |
| POST /ai/summary/retry-failed | OK | Retry API responded successfully. No failed queue needed retry at the time of test. |
| Project Assets Check | OK | project_assets table and related project asset check completed. |
| .env Security Check | OK | .env, .env.example, and .gitignore exist as hidden/config files. .gitignore includes .env, .env.example contains sample values only, and server logs do not print sensitive values. |

## Issues Found and Adjusted

| Issue | Cause | Resolution |
|---|---|---|
| EADDRINUSE on port 3010 | Existing server process was already using port 3010 | Existing process was identified/cleared, then server was restarted |
| /ai/ask 400 Bad Request | Request used "message" field, but API requires "question" | Postman Body changed from message to question |
| ai_recent_buffer SQL error | Checklist SQL used non-existing "content" column | Actual column confirmed as "message"; SQL updated |
| ai_summary_queue SQL error | Checklist SQL used non-existing "retry_count" column | SQL changed to SELECT * or actual table columns |
| DBeaver SSH warning | NAS reboot after power loss changed SSH host identification | NAS IP confirmed and DBeaver connection restored |
| Memory Search JSON error | SQL text was mistakenly entered in Postman JSON Body | GET request was resent with Body set to none |
| /ai/memory/save 400 Bad Request | API requires project_code, title, and summary | Request Body changed to use title and summary |

## Final Status

```text
Phase 5C Final Check: Completed

| Phase 8-1 Server Restart | CHECK_REQUIRED | EADDRINUSE occurred because port 3010 was already occupied. Need to kill existing PID and restart server. |

| Phase 8-2 Queue and Memory Load | CHECK_REQUIRED | Summary queue API returns data in results array, and recent memory API requires project_code. dashboard.js needs update. |

| Phase 8-3 Admin Display Enhancement | OK | Added local date formatting, status badges, and improved preview cell display for queue and recent memory tables. |

| Phase 8-4A Memory Search UI | OK | Added project_code input, keyword search input, Search Memory button, and connected /ai/memory/search API. Browser cache issue was resolved and search test works normally. |
| Phase 8-4B Memory Detail View | OK | Added View button and memory detail panel connected to GET /ai/memory/:id. Detail test works normally. |

| Phase 8-4C Memory Status Update | OK_WITH_UI_IMPROVEMENT | Archive button successfully changes memory status, but archived items disappear from the active recent memory list. Need status filter to view archived/deleted items. |

| Phase 8-4C-1 Memory Status Filter | OK | Added status filter for active, archived, deleted, and all. Confirmed archived status is the correct stored value and archived memory can be filtered. |

| Phase 8-4D Manual Memory Save | OK | Added manual memory form with project_code, title, and summary fields. Connected Save Manual Memory button to POST /ai/memory/save and confirmed memory ID 27 was saved from admin screen. |

| Phase 8-5A Summary Queue Status Filter | OK | Added queue status filter for all, pending, processing, completed, and failed. Confirmed completed filter displays completed queue rows correctly. |

| Phase 8-5B Queue Detail View | OK | Added View button to Summary Queue rows and Queue Detail panel. Confirmed selected queue row JSON is displayed from loaded queue data. |

| Phase 8-5C Conversation Log Link | OK | Added Conversation button to Summary Queue rows and Conversation Detail panel. Connected button to GET /ai/conversation/:id and confirmed original conversation JSON is displayed. |

| Phase 8-5D Failed Queue Operation Improvement | OK | Added Retry Result output panel, improved failed queue empty-state message, enhanced error message display, and confirmed Retry Failed button reloads queue after request. |

| Phase 8-5E Queue Summary Cards | OK | Added queue summary cards for all, pending, processing, completed, and failed. Cards update when Load Queue or Retry Failed is executed. |

| Phase 8-6A Project Assets List and Detail | CHECK_REQUIRED | API reached backend, but project_assets query failed because updated_at column does not exist. Need to add updated_at column or adjust SQL. |

| Phase 8-6B Project Asset Create | OK | Added Create Project Asset form and connected it to POST /ai/project/assets. Confirmed new asset can be created and displayed in Project Assets table. |

| Phase 8-6C Project Asset Update | OK | Added Edit button and Edit Project Asset form. Connected Update Asset button to PATCH /ai/project/assets/:id and confirmed asset can be updated from admin screen. |

| Phase 8-7A/B Conversation Logs Section and Session Search | OK | Added Conversation Logs section, session_id search, conversation table, and detail panel connected to GET /ai/session/:session_id and GET /ai/conversation/:id. |

| Phase 8-7D Linked Memory View | OK | Added Linked Memory panel and button to Conversation Logs. Reused existing GET /ai/conversation/:id route because it already returns linked_memories_count and linked_memories. Confirmed linked memory JSON is displayed from admin screen. |

| Phase 8-8 Dashboard Metrics Enhancement | OK | Added dashboard count cards for queue status, recent memory, and project assets. Counts are loaded through existing APIs and refreshed with the Dashboard refresh button. |

| Phase 8-9 Context Preview Screen | OK | Added Context Preview section with project_code, session_id, and question fields. Connected Run Context Preview button to POST /ai/context/preview and confirmed context JSON is displayed from admin screen. |

| Phase 8-10 Context Rebuild Screen | OK | Added Context Rebuild section with project_code and session_id fields. Connected Run Context Rebuild button to POST /ai/context/rebuild and confirmed result JSON is displayed from admin screen. |

| Phase 8-11A Admin Token Access Control | OK | Added ADMIN_ENABLED and ADMIN_TOKEN, created admin-auth middleware, protected /admin access, and confirmed valid token opens the admin console. |

| Phase 8-10 Context Rebuild Screen Fix | OK | Added question field to Context Rebuild form and included question in POST /ai/context/rebuild payload. Confirmed rebuild request works without required-field error. |

| Phase 8-11B Admin API Token Header | OK | Updated admin api.js so all AdminAPI requests include x-admin-token from URL token or localStorage. Confirmed admin screen loads and protected admin features still operate after token header update. |

| Phase 8-11C Admin API Protection | OK | Confirmed protected POST/PATCH admin APIs return 401 without x-admin-token and work with valid x-admin-token. |