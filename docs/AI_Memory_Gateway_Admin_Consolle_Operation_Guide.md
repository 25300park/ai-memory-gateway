# AI Memory Gateway Admin Console Operation Guide

## 1. Document Purpose

This document explains how to operate the AI Memory Gateway Admin Console.

The Admin Console is used to monitor, search, manage, and verify the AI Memory Gateway system, including:

* System status
* Summary queue
* Long-term memory
* Project assets
* Conversation logs
* Context preview
* Context rebuild
* Admin access security

---

## 2. Admin Console Access

### 2.1 Admin URL

Use the following URL to access the Admin Console:

```text
http://localhost:3010/admin
```

If admin token protection is enabled, access with:

```text
http://localhost:3010/admin?token=YOUR_ADMIN_TOKEN
```

### 2.2 Login Rule

If the user opens `/admin` without a valid token, the Admin Access screen will appear.

The correct admin token must be entered to open the console.

### 2.3 Environment Variables

The following values must exist in `.env`:

```env
ADMIN_ENABLED=true
ADMIN_TOKEN=your_admin_token
```

Important:

* `.env` must contain the actual admin token.
* `.env.example` must contain only a sample token.
* Never upload the actual `.env` token to Git or public storage.

---

## 3. Server Start Procedure

### 3.1 Start Server

Move to the API root folder:

```bash
cd "/z/01. Ai_Memory_System/api"
```

Start the server:

```bash
npm run dev
```

Normal result:

```text
AI Memory Gateway running on port 3010
```

### 3.2 If Port 3010 Is Already Used

Check the process using port 3010:

```cmd
netstat -ano | findstr :3010
```

Kill the PID:

```cmd
taskkill /PID ACTUAL_PID /F
```

Then restart:

```bash
npm run dev
```

---

## 4. Dashboard

### Purpose

The Dashboard shows the basic system health and operating metrics.

### Items Checked

| Item            | Meaning                                    |
| --------------- | ------------------------------------------ |
| API Server      | Confirms the Node.js API server is running |
| DB Connection   | Confirms MariaDB connection is working     |
| System Status   | Confirms system API status                 |
| Last Checked    | Last refresh time                          |
| Total Queue     | Total summary queue count                  |
| Pending Queue   | Queue items waiting for processing         |
| Completed Queue | Queue items completed                      |
| Failed Queue    | Queue items failed                         |
| Recent Memory   | Recent long-term memory count              |
| Project Assets  | Project asset count                        |

### Operation

Click:

```text
Refresh
```

Normal result:

* API Server: OK
* DB Connection: OK
* System Status: OK
* Dashboard count cards show numbers

---

## 5. Summary Queue

### Purpose

Summary Queue is used to monitor conversation summary jobs.

### Main Functions

| Function            | Description                                           |
| ------------------- | ----------------------------------------------------- |
| Load Queue          | Load queue list                                       |
| Status Filter       | Filter by all, pending, processing, completed, failed |
| Queue Detail        | View selected queue JSON                              |
| Conversation        | View original conversation connected to queue         |
| Retry Failed        | Retry failed summary jobs                             |
| Queue Summary Cards | Show queue status count                               |

### Operation

1. Select queue status.
2. Click `Load Queue`.
3. Check the queue table.
4. Click `Queue` to view queue detail.
5. Click `Conversation` to view the original conversation.
6. If failed queue exists, click `Retry Failed`.

### Normal Result

* Completed queue rows appear when `completed` is selected.
* Failed filter shows failed rows or “No failed queue found.”
* Queue Detail panel displays JSON.
* Conversation Detail panel displays original conversation JSON.

---

## 6. Memory Manager

### Purpose

Memory Manager is used to search, view, update, and manually save long-term memories.

### Main Functions

| Function           | Description                      |
| ------------------ | -------------------------------- |
| Load Recent Memory | Load recent memories             |
| Search Memory      | Search memory by keyword         |
| Status Filter      | active, archived, deleted, all   |
| View               | View memory detail               |
| Activate           | Change memory status to active   |
| Archive            | Change memory status to archived |
| Delete             | Change memory status to deleted  |
| Save Manual Memory | Manually save long-term memory   |

### Operation: Load Recent Memory

1. Enter project code:

```text
rbs_ai_memory
```

2. Select status:

```text
active
```

3. Click:

```text
Load Recent Memory
```

### Operation: Search Memory

1. Enter keyword.
2. Click:

```text
Search Memory
```

### Operation: Change Status

1. Load memory list.
2. Click `Archive`, `Activate`, or `Delete`.
3. Confirm the alert.
4. Reload with the correct status filter.

Example:

* If memory is archived, it may disappear from the active list.
* Select `archived` and click `Load Recent Memory` to see it again.

### Operation: Save Manual Memory

Required fields:

| Field        | Example                      |
| ------------ | ---------------------------- |
| Project Code | `rbs_ai_memory`              |
| Title        | `Manual Memory Title`        |
| Summary      | `Manual memory summary text` |

Click:

```text
Save Manual Memory
```

Normal result:

* New memory is saved.
* It appears in Recent Memory.
* Type is usually `manual_note`.

---

## 7. Project Assets

### Purpose

Project Assets manage project-level rules and reference information used by the AI Memory Gateway.

Asset types include:

```text
persona
rule
vocabulary
workflow
formatting
reference_doc
```

### Main Functions

| Function     | Description               |
| ------------ | ------------------------- |
| Load Assets  | Load project assets       |
| Type Filter  | Filter assets by type     |
| View         | View selected asset JSON  |
| Create Asset | Create new project asset  |
| Edit Asset   | Load asset into edit form |
| Update Asset | Update selected asset     |

### Operation: Load Assets

1. Enter project code:

```text
rbs_ai_memory
```

2. Select type:

```text
all
```

3. Click:

```text
Load Assets
```

### Operation: Create Asset

Required fields:

| Field        | Example                                                            |
| ------------ | ------------------------------------------------------------------ |
| Project Code | `rbs_ai_memory`                                                    |
| Asset Type   | `rule`                                                             |
| Title        | `Admin Console Rule`                                               |
| Priority     | `100`                                                              |
| Content      | `The admin console should be used to manage system memory safely.` |

Click:

```text
Create Asset
```

### Operation: Update Asset

1. Click `Load Assets`.
2. Click `Edit` on the asset row.
3. Modify title, content, type, priority, or status.
4. Click:

```text
Update Asset
```

Normal result:

* Asset is updated.
* Asset list reloads.
* `View` shows updated JSON.

---

## 8. Conversation Logs

### Purpose

Conversation Logs allow the operator to view original conversation records by session ID.

### Main Functions

| Function          | Description                            |
| ----------------- | -------------------------------------- |
| Load Session Logs | Load conversation logs by session_id   |
| View              | View original conversation detail      |
| Linked Memory     | View memory linked to the conversation |

### Operation

1. Enter session ID:

```text
phase-5c-final-test-001
```

2. Click:

```text
Load Session Logs
```

3. Click `View` to inspect the original conversation.
4. Click `Linked Memory` to inspect linked long-term memory.

### Normal Result

* Conversation rows appear.
* Conversation Detail displays JSON.
* Linked Memory displays `linked_memories_count` and `linked_memories`.

---

## 9. Context Preview

### Purpose

Context Preview shows what context will be assembled before the AI response is generated.

It is used to check whether recent buffer, long-term memory, and project assets are correctly included.

### Required Fields

| Field        | Example                                           |
| ------------ | ------------------------------------------------- |
| Project Code | `rbs_ai_memory`                                   |
| Session ID   | `phase-5c-final-test-001`                         |
| Question     | `Check whether the saved memory can be recalled.` |

### Operation

1. Enter project code.
2. Enter session ID.
3. Enter question.
4. Click:

```text
Run Context Preview
```

### Normal Result

* Context preview JSON is displayed.
* Related memory, recent buffer, or assets appear in the result.

---

## 10. Context Rebuild

### Purpose

Context Rebuild runs a rebuild request for a selected project and session.

### Required Fields

| Field        | Example                                          |
| ------------ | ------------------------------------------------ |
| Project Code | `rbs_ai_memory`                                  |
| Session ID   | `phase-5c-final-test-001`                        |
| Question     | `Check whether context rebuild works correctly.` |

### Operation

1. Enter project code.
2. Enter session ID.
3. Enter question.
4. Click:

```text
Run Context Rebuild
```

5. Confirm the alert.

### Normal Result

* Rebuild result JSON is displayed.
* No “project_code, session_id, and question are required” error appears.

---

## 11. Admin Security

### 11.1 Admin Page Protection

The Admin Console is protected by:

```env
ADMIN_ENABLED=true
ADMIN_TOKEN=your_admin_token
```

Access without token:

```text
http://localhost:3010/admin
```

Expected result:

```text
Admin Access login screen
```

Access with token:

```text
http://localhost:3010/admin?token=YOUR_ADMIN_TOKEN
```

Expected result:

```text
AI Memory Gateway Admin Console opens
```

### 11.2 Admin API Protection

Important POST/PATCH APIs are protected by:

```text
x-admin-token
```

Protected API examples:

| API                             | Purpose              |
| ------------------------------- | -------------------- |
| `POST /ai/memory/save`          | Save manual memory   |
| `PATCH /ai/memory/:id/status`   | Update memory status |
| `POST /ai/summary/retry-failed` | Retry failed queue   |
| `POST /ai/project/assets`       | Create project asset |
| `PATCH /ai/project/assets/:id`  | Update project asset |
| `POST /ai/context/preview`      | Run context preview  |
| `POST /ai/context/rebuild`      | Run context rebuild  |

### 11.3 Expected Unauthorized Response

If token is missing:

```json
{
  "ok": false,
  "error": {
    "code": "ADMIN_UNAUTHORIZED",
    "message": "Valid admin token is required."
  }
}
```

---

## 12. Common Errors and Meaning

| Error                          | Meaning                                  | Solution                                |
| ------------------------------ | ---------------------------------------- | --------------------------------------- |
| `EADDRINUSE: port 3010`        | Server already running                   | Kill PID using `netstat` and `taskkill` |
| `Route not found: GET /admin`  | Static admin route not connected         | Check `app.js` admin static middleware  |
| `title is required`            | Required form field is empty             | Fill title field                        |
| `Please select an asset first` | Update clicked before selecting asset    | Click asset row `Edit` first            |
| `project_code is required`     | Required API field missing               | Check form input                        |
| `question is required`         | Context preview/rebuild question missing | Add question field                      |
| `ADMIN_UNAUTHORIZED`           | Missing or wrong admin token             | Use correct `x-admin-token`             |
| `Unknown column updated_at`    | DB schema mismatch                       | Add missing column or adjust SQL        |

---

## 13. Daily Operation Checklist

Use this checklist when starting daily operation.

```markdown
- [ ] Start server with `npm run dev`
- [ ] Confirm `AI Memory Gateway running on port 3010`
- [ ] Open `/admin?token=ADMIN_TOKEN`
- [ ] Confirm Dashboard API Server OK
- [ ] Confirm DB Connection OK
- [ ] Click Load Queue
- [ ] Check failed queue count
- [ ] Click Load Recent Memory
- [ ] Confirm recent memories are visible
- [ ] Click Load Assets
- [ ] Confirm project assets are visible
- [ ] Run Context Preview test
- [ ] Run Context Rebuild test if needed
```

---

## 14. Weekly Operation Checklist

```markdown
- [ ] Review failed queue history
- [ ] Review archived/deleted memories
- [ ] Review project assets and update rules if needed
- [ ] Check whether important conversations are linked to memory
- [ ] Test admin token access
- [ ] Confirm protected APIs reject requests without token
- [ ] Back up database
- [ ] Update operation checklist if system changes
```

---

## 15. Phase 8 Completion Status

| Phase | Item                                | Status |
| ----- | ----------------------------------- | ------ |
| 8-1   | Admin basic screen                  | OK     |
| 8-2   | Queue and memory API connection     | OK     |
| 8-3   | Display enhancement                 | OK     |
| 8-4   | Memory Manager                      | OK     |
| 8-5   | Summary Queue Manager               | OK     |
| 8-6   | Project Assets Manager              | OK     |
| 8-7   | Conversation Logs and Linked Memory | OK     |
| 8-8   | Dashboard Metrics                   | OK     |
| 8-9   | Context Preview                     | OK     |
| 8-10  | Context Rebuild                     | OK     |
| 8-11A | Admin token access control          | OK     |
| 8-11B | Admin API token header              | OK     |
| 8-11C | Admin API protection                | OK     |

---

## 16. Final Note

The Admin Console is now the primary operating interface for AI Memory Gateway.

DBeaver and Postman should be used mainly for debugging, database inspection, and emergency correction.
Daily operation should be performed through the Admin Console whenever possible.
