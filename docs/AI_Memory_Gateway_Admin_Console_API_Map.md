# AI Memory Gateway Admin Console API Map

## 1. Document Purpose

This document maps each Admin Console menu, button, and feature to the backend API used by AI Memory Gateway.

The purpose of this document is to make it easy to understand:

* Which screen uses which API
* Which APIs are read-only
* Which APIs modify data
* Which APIs require `x-admin-token`
* Which database tables are involved

---

## 2. Admin Console Base URL

Admin Console:

```text
http://localhost:3010/admin
```

Admin Console with token:

```text
http://localhost:3010/admin?token=YOUR_ADMIN_TOKEN
```

API base URL:

```text
http://localhost:3010/ai
```

Health base URL:

```text
http://localhost:3010
```

---

## 3. Admin Security Header

Important POST/PATCH APIs require:

```text
x-admin-token: YOUR_ADMIN_TOKEN
```

The Admin Console automatically sends this header through `src/public/admin/js/api.js`.

Token source priority:

| Priority | Source                             |
| -------: | ---------------------------------- |
|        1 | URL query `?token=...`             |
|        2 | Browser `localStorage.admin_token` |

---

## 4. Dashboard API Map

### 4.1 API Server Status

| Item            | Value                               |
| --------------- | ----------------------------------- |
| Screen          | Dashboard                           |
| Button          | Refresh                             |
| API             | `GET /health`                       |
| Purpose         | Check whether API server is running |
| Auth Required   | No                                  |
| Main Table      | None                                |
| Expected Result | API status OK                       |

---

### 4.2 DB Connection Status

| Item            | Value                     |
| --------------- | ------------------------- |
| Screen          | Dashboard                 |
| Button          | Refresh                   |
| API             | `GET /health/db`          |
| Purpose         | Check database connection |
| Auth Required   | No                        |
| Main Table      | DB connection check       |
| Expected Result | DB connection OK          |

---

### 4.3 System Status

| Item            | Value                                 |
| --------------- | ------------------------------------- |
| Screen          | Dashboard                             |
| Button          | Refresh                               |
| API             | `GET /ai/system/status`               |
| Purpose         | Check AI Memory Gateway system status |
| Auth Required   | No                                    |
| Main Table      | Multiple system checks                |
| Expected Result | System status OK                      |

---

### 4.4 Dashboard Queue Metrics

| Item            | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Screen          | Dashboard                                                           |
| Button          | Refresh                                                             |
| API             | `GET /ai/summary/queue`                                             |
| Purpose         | Calculate total, pending, processing, completed, failed queue count |
| Auth Required   | No                                                                  |
| Main Table      | `ai_summary_queue`                                                  |
| Expected Result | Queue count cards updated                                           |

---

### 4.5 Dashboard Recent Memory Count

| Item            | Value                                              |
| --------------- | -------------------------------------------------- |
| Screen          | Dashboard                                          |
| Button          | Refresh                                            |
| API             | `GET /ai/memory/recent?project_code=rbs_ai_memory` |
| Purpose         | Count recent long-term memories                    |
| Auth Required   | No                                                 |
| Main Table      | `ai_memory`                                        |
| Expected Result | Recent Memory card updated                         |

---

### 4.6 Dashboard Project Asset Count

| Item            | Value                                  |
| --------------- | -------------------------------------- |
| Screen          | Dashboard                              |
| Button          | Refresh                                |
| API             | `GET /ai/project/:project_code/assets` |
| Example         | `GET /ai/project/rbs_ai_memory/assets` |
| Purpose         | Count project assets                   |
| Auth Required   | No                                     |
| Main Table      | `project_assets`                       |
| Expected Result | Project Assets card updated            |

---

## 5. Summary Queue API Map

### 5.1 Load Queue

| Item            | Value                                     |
| --------------- | ----------------------------------------- |
| Screen          | Summary Queue                             |
| Button          | Load Queue                                |
| API             | `GET /ai/summary/queue`                   |
| Optional Query  | `status=completed`, `status=failed`, etc. |
| Purpose         | Load summary queue rows                   |
| Auth Required   | No                                        |
| Main Table      | `ai_summary_queue`                        |
| Expected Result | Queue table displays rows                 |

Example:

```text
GET /ai/summary/queue
GET /ai/summary/queue?status=completed
```

---

### 5.2 Queue Status Filter

| Item            | Value                                                 |
| --------------- | ----------------------------------------------------- |
| Screen          | Summary Queue                                         |
| Control         | Status Filter                                         |
| Values          | `all`, `pending`, `processing`, `completed`, `failed` |
| API             | `GET /ai/summary/queue`                               |
| Purpose         | Filter queue rows by status                           |
| Auth Required   | No                                                    |
| Filtering       | Backend query and/or frontend filtering               |
| Expected Result | Only selected status rows appear                      |

---

### 5.3 Queue Detail View

| Item            | Value                            |
| --------------- | -------------------------------- |
| Screen          | Summary Queue                    |
| Button          | Queue                            |
| API             | None                             |
| Purpose         | Show selected queue row JSON     |
| Auth Required   | No                               |
| Data Source     | Already loaded queue rows        |
| Expected Result | Queue Detail panel displays JSON |

---

### 5.4 Conversation Detail From Queue

| Item            | Value                                      |
| --------------- | ------------------------------------------ |
| Screen          | Summary Queue                              |
| Button          | Conversation                               |
| API             | `GET /ai/conversation/:id`                 |
| Purpose         | Show original conversation linked to queue |
| Auth Required   | No                                         |
| Main Table      | `ai_conversation_logs`                     |
| Related Tables  | `ai_memory_links`, `ai_memory`             |
| Expected Result | Conversation Detail panel displays JSON    |

Example:

```text
GET /ai/conversation/20
```

---

### 5.5 Retry Failed Queue

| Item            | Value                                         |
| --------------- | --------------------------------------------- |
| Screen          | Summary Queue                                 |
| Button          | Retry Failed                                  |
| API             | `POST /ai/summary/retry-failed`               |
| Purpose         | Retry failed summary queue items              |
| Auth Required   | Yes                                           |
| Header          | `x-admin-token`                               |
| Main Table      | `ai_summary_queue`                            |
| Expected Result | Retry result JSON displayed and queue reloads |

Example:

```text
POST /ai/summary/retry-failed
```

---

### 5.6 Queue Summary Cards

| Item            | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| Screen          | Summary Queue                                                |
| API             | `GET /ai/summary/queue`                                      |
| Purpose         | Count all, pending, processing, completed, failed queue rows |
| Auth Required   | No                                                           |
| Main Table      | `ai_summary_queue`                                           |
| Expected Result | Queue summary cards updated                                  |

---

## 6. Memory Manager API Map

### 6.1 Load Recent Memory

| Item            | Value                                              |
| --------------- | -------------------------------------------------- |
| Screen          | Memory Manager                                     |
| Button          | Load Recent Memory                                 |
| API             | `GET /ai/memory/recent?project_code=:project_code` |
| Purpose         | Load recent memories                               |
| Auth Required   | No                                                 |
| Main Table      | `ai_memory`                                        |
| Expected Result | Recent memory table displays rows                  |

Example:

```text
GET /ai/memory/recent?project_code=rbs_ai_memory
```

---

### 6.2 Memory Status Filter

| Item            | Value                                                             |
| --------------- | ----------------------------------------------------------------- |
| Screen          | Memory Manager                                                    |
| Control         | Status Filter                                                     |
| Values          | `active`, `archived`, `deleted`, `all`                            |
| API             | `GET /ai/memory/recent?project_code=:project_code&status=:status` |
| Purpose         | Filter memory rows by status                                      |
| Auth Required   | No                                                                |
| Main Table      | `ai_memory`                                                       |
| Expected Result | Only selected status rows appear                                  |

---

### 6.3 Search Memory

| Item            | Value                                  |
| --------------- | -------------------------------------- |
| Screen          | Memory Manager                         |
| Button          | Search Memory                          |
| API             | `GET /ai/memory/search`                |
| Query           | `project_code`, `q`, optional `status` |
| Purpose         | Search long-term memory by keyword     |
| Auth Required   | No                                     |
| Main Table      | `ai_memory`                            |
| Expected Result | Matching memory rows displayed         |

Example:

```text
GET /ai/memory/search?project_code=rbs_ai_memory&q=Phase%205C
```

---

### 6.4 Memory Detail View

| Item            | Value                             |
| --------------- | --------------------------------- |
| Screen          | Memory Manager                    |
| Button          | View                              |
| API             | `GET /ai/memory/:id`              |
| Purpose         | View selected memory detail       |
| Auth Required   | No                                |
| Main Table      | `ai_memory`                       |
| Expected Result | Memory Detail panel displays JSON |

Example:

```text
GET /ai/memory/27
```

---

### 6.5 Update Memory Status

| Item            | Value                         |
| --------------- | ----------------------------- |
| Screen          | Memory Manager                |
| Button          | Activate / Archive / Delete   |
| API             | `PATCH /ai/memory/:id/status` |
| Purpose         | Change memory status          |
| Auth Required   | Yes                           |
| Header          | `x-admin-token`               |
| Main Table      | `ai_memory`                   |
| Expected Result | Memory status updated         |

Example body:

```json
{
  "status": "archived"
}
```

Allowed status values:

```text
active
archived
deleted
```

---

### 6.6 Save Manual Memory

| Item            | Value                           |
| --------------- | ------------------------------- |
| Screen          | Memory Manager                  |
| Button          | Save Manual Memory              |
| API             | `POST /ai/memory/save`          |
| Purpose         | Save manual long-term memory    |
| Auth Required   | Yes                             |
| Header          | `x-admin-token`                 |
| Main Table      | `ai_memory`                     |
| Expected Result | New memory saved as manual note |

Example body:

```json
{
  "project_code": "rbs_ai_memory",
  "title": "Manual memory title",
  "summary": "Manual memory summary"
}
```

---

## 7. Project Assets API Map

### 7.1 Load Project Assets

| Item            | Value                                  |
| --------------- | -------------------------------------- |
| Screen          | Project Assets                         |
| Button          | Load Assets                            |
| API             | `GET /ai/project/:project_code/assets` |
| Purpose         | Load project assets                    |
| Auth Required   | No                                     |
| Main Table      | `project_assets`                       |
| Expected Result | Asset table displays rows              |

Example:

```text
GET /ai/project/rbs_ai_memory/assets
```

---

### 7.2 Asset Type Filter

| Item            | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| Screen          | Project Assets                                                                    |
| Control         | Asset Type Filter                                                                 |
| Values          | `all`, `persona`, `rule`, `vocabulary`, `workflow`, `formatting`, `reference_doc` |
| API             | `GET /ai/project/:project_code/assets`                                            |
| Purpose         | Filter loaded assets by type                                                      |
| Auth Required   | No                                                                                |
| Filtering       | Frontend filtering                                                                |
| Main Table      | `project_assets`                                                                  |
| Expected Result | Selected asset type appears                                                       |

---

### 7.3 Asset Detail View

| Item            | Value                            |
| --------------- | -------------------------------- |
| Screen          | Project Assets                   |
| Button          | View                             |
| API             | None                             |
| Purpose         | Show selected asset JSON         |
| Auth Required   | No                               |
| Data Source     | Already loaded asset rows        |
| Expected Result | Asset Detail panel displays JSON |

---

### 7.4 Create Project Asset

| Item            | Value                               |
| --------------- | ----------------------------------- |
| Screen          | Project Assets                      |
| Button          | Create Asset                        |
| API             | `POST /ai/project/assets`           |
| Purpose         | Create new project asset            |
| Auth Required   | Yes                                 |
| Header          | `x-admin-token`                     |
| Main Table      | `project_assets`                    |
| Expected Result | New asset created and list reloaded |

Example body:

```json
{
  "project_code": "rbs_ai_memory",
  "asset_type": "rule",
  "title": "Admin Console Rule",
  "content": "Admin console should be used for safe operation.",
  "priority": 100
}
```

---

### 7.5 Edit Project Asset

| Item            | Value                                        |
| --------------- | -------------------------------------------- |
| Screen          | Project Assets                               |
| Button          | Edit                                         |
| API             | None                                         |
| Purpose         | Load selected asset into edit form           |
| Auth Required   | No                                           |
| Data Source     | Already loaded asset rows                    |
| Expected Result | Edit form is filled with selected asset data |

---

### 7.6 Update Project Asset

| Item            | Value                           |
| --------------- | ------------------------------- |
| Screen          | Project Assets                  |
| Button          | Update Asset                    |
| API             | `PATCH /ai/project/assets/:id`  |
| Purpose         | Update selected project asset   |
| Auth Required   | Yes                             |
| Header          | `x-admin-token`                 |
| Main Table      | `project_assets`                |
| Expected Result | Asset updated and list reloaded |

Example body:

```json
{
  "asset_type": "rule",
  "title": "Updated Rule",
  "content": "Updated asset content.",
  "priority": 100,
  "status": "active"
}
```

---

## 8. Conversation Logs API Map

### 8.1 Load Session Logs

| Item            | Value                            |
| --------------- | -------------------------------- |
| Screen          | Conversation Logs                |
| Button          | Load Session Logs                |
| API             | `GET /ai/session/:session_id`    |
| Purpose         | Load conversations by session_id |
| Auth Required   | No                               |
| Main Table      | `ai_conversation_logs`           |
| Expected Result | Conversation rows displayed      |

Example:

```text
GET /ai/session/phase-5c-final-test-001
```

---

### 8.2 Conversation Detail View

| Item            | Value                              |
| --------------- | ---------------------------------- |
| Screen          | Conversation Logs                  |
| Button          | View                               |
| API             | `GET /ai/conversation/:id`         |
| Purpose         | View original conversation detail  |
| Auth Required   | No                                 |
| Main Table      | `ai_conversation_logs`             |
| Related Tables  | `ai_memory_links`, `ai_memory`     |
| Expected Result | Conversation detail JSON displayed |

Example:

```text
GET /ai/conversation/20
```

---

### 8.3 Linked Memory View

| Item            | Value                                                   |
| --------------- | ------------------------------------------------------- |
| Screen          | Conversation Logs                                       |
| Button          | Linked Memory                                           |
| API             | `GET /ai/conversation/:id`                              |
| Purpose         | View memories linked to selected conversation           |
| Auth Required   | No                                                      |
| Main Table      | `ai_memory_links`                                       |
| Related Table   | `ai_memory`                                             |
| Expected Result | `linked_memories_count` and `linked_memories` displayed |

Note:

The existing `GET /ai/conversation/:id` route already returns:

```text
linked_memories_count
linked_memories
```

Therefore, no separate linked memory route is required.

---

## 9. Context Preview API Map

### 9.1 Run Context Preview

| Item            | Value                                             |
| --------------- | ------------------------------------------------- |
| Screen          | Context Preview                                   |
| Button          | Run Context Preview                               |
| API             | `POST /ai/context/preview`                        |
| Purpose         | Preview context before AI response                |
| Auth Required   | Yes                                               |
| Header          | `x-admin-token`                                   |
| Main Tables     | `ai_recent_buffer`, `ai_memory`, `project_assets` |
| Expected Result | Context preview JSON displayed                    |

Example body:

```json
{
  "project_code": "rbs_ai_memory",
  "session_id": "phase-5c-final-test-001",
  "question": "Check whether saved memory can be recalled."
}
```

---

## 10. Context Rebuild API Map

### 10.1 Run Context Rebuild

| Item            | Value                                             |
| --------------- | ------------------------------------------------- |
| Screen          | Context Rebuild                                   |
| Button          | Run Context Rebuild                               |
| API             | `POST /ai/context/rebuild`                        |
| Purpose         | Rebuild context for selected session and question |
| Auth Required   | Yes                                               |
| Header          | `x-admin-token`                                   |
| Main Tables     | `ai_recent_buffer`, `ai_memory`, `project_assets` |
| Expected Result | Context rebuild JSON displayed                    |

Example body:

```json
{
  "project_code": "rbs_ai_memory",
  "session_id": "phase-5c-final-test-001",
  "question": "Check whether context rebuild works correctly."
}
```

Required fields:

```text
project_code
session_id
question
```

---

## 11. System Status API Map

### 11.1 System Raw Response

| Item            | Value                                                    |
| --------------- | -------------------------------------------------------- |
| Screen          | System Status                                            |
| Source          | Dashboard Refresh                                        |
| APIs            | `GET /health`, `GET /health/db`, `GET /ai/system/status` |
| Purpose         | Display raw system status response                       |
| Auth Required   | No                                                       |
| Expected Result | Raw JSON appears in System Raw Response panel            |

---

## 12. Protected API List

The following APIs should reject requests without a valid admin token.

| Method | API                        | Purpose              |
| ------ | -------------------------- | -------------------- |
| POST   | `/ai/memory/save`          | Save manual memory   |
| PATCH  | `/ai/memory/:id/status`    | Update memory status |
| POST   | `/ai/summary/retry-failed` | Retry failed queue   |
| POST   | `/ai/project/assets`       | Create project asset |
| PATCH  | `/ai/project/assets/:id`   | Update project asset |
| POST   | `/ai/context/preview`      | Run context preview  |
| POST   | `/ai/context/rebuild`      | Run context rebuild  |

Expected response without token:

```json
{
  "ok": false,
  "error": {
    "code": "ADMIN_UNAUTHORIZED",
    "message": "Valid admin token is required."
  }
}
```

Expected request header with token:

```text
x-admin-token: YOUR_ADMIN_TOKEN
```

---

## 13. Frontend File Map

| File                               | Purpose                                                       |
| ---------------------------------- | ------------------------------------------------------------- |
| `src/public/admin/index.html`      | Admin console UI structure                                    |
| `src/public/admin/css/admin.css`   | Admin console styling                                         |
| `src/public/admin/js/api.js`       | AdminAPI wrapper and token header injection                   |
| `src/public/admin/js/dashboard.js` | Dashboard, Queue, Memory, Assets, Conversation, Context logic |

---

## 14. Backend File Map

| File                                           | Purpose                                     |
| ---------------------------------------------- | ------------------------------------------- |
| `src/app.js`                                   | Express app setup and `/admin` static route |
| `src/server.js`                                | Server start on port 3010                   |
| `src/routes/ai.routes.js`                      | AI Memory Gateway API routes                |
| `src/middlewares/admin-auth.middleware.js`     | Protect `/admin` page access                |
| `src/middlewares/admin-api-auth.middleware.js` | Protect important admin APIs                |
| `src/middlewares/error.middleware.js`          | Common error handling                       |
| `src/middlewares/request-logger.middleware.js` | Request logging                             |

---

## 15. Database Table Map

| Table                  | Used By                                          |
| ---------------------- | ------------------------------------------------ |
| `ai_conversation_logs` | Conversation Logs, Queue Conversation Detail     |
| `ai_recent_buffer`     | Context Preview, Context Rebuild                 |
| `ai_summary_queue`     | Summary Queue                                    |
| `ai_memory`            | Memory Manager, Context Preview, Linked Memory   |
| `ai_memory_links`      | Linked Memory                                    |
| `project_assets`       | Project Assets, Context Preview, Context Rebuild |
| `ai_projects`          | Project-level grouping                           |
| `ai_context_sessions`  | Context/session management if used by backend    |

---

## 16. Final API Map Summary

| Admin Menu        | Main APIs                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard         | `GET /health`, `GET /health/db`, `GET /ai/system/status`, `GET /ai/summary/queue`, `GET /ai/memory/recent`, `GET /ai/project/:project_code/assets` |
| Summary Queue     | `GET /ai/summary/queue`, `POST /ai/summary/retry-failed`, `GET /ai/conversation/:id`                                                               |
| Memory Manager    | `GET /ai/memory/recent`, `GET /ai/memory/search`, `GET /ai/memory/:id`, `PATCH /ai/memory/:id/status`, `POST /ai/memory/save`                      |
| Project Assets    | `GET /ai/project/:project_code/assets`, `POST /ai/project/assets`, `PATCH /ai/project/assets/:id`                                                  |
| Conversation Logs | `GET /ai/session/:session_id`, `GET /ai/conversation/:id`                                                                                          |
| Context Preview   | `POST /ai/context/preview`                                                                                                                         |
| Context Rebuild   | `POST /ai/context/rebuild`                                                                                                                         |
| System Status     | `GET /health`, `GET /health/db`, `GET /ai/system/status`                                                                                           |
