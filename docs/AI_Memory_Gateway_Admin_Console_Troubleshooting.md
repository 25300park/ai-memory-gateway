# AI Memory Gateway Admin Console Troubleshooting Guide

## 1. Document Purpose

This document summarizes common errors, causes, and solutions for the AI Memory Gateway Admin Console.

It covers issues related to:

* Server startup
* Port conflict
* Admin page access
* Admin token authentication
* API token protection
* Dashboard
* Summary Queue
* Memory Manager
* Project Assets
* Conversation Logs
* Context Preview / Rebuild
* Database schema mismatch
* Browser cache

---

# 2. Server Startup Issues

## 2.1 `ENOENT Could not read package.json`

### Error Example

```text
npm error enoent Could not read package.json
```

### Cause

`npm run dev` was executed from the wrong folder.

Example wrong location:

```text
src/public/admin
```

### Correct Location

Run `npm run dev` only from the API root folder:

```text
Z:\01. Ai_Memory_System\api
```

Git Bash:

```bash
cd "/z/01. Ai_Memory_System/api"
npm run dev
```

### Normal Result

```text
AI Memory Gateway running on port 3010
```

---

## 2.2 `EADDRINUSE: address already in use :::3010`

### Error Example

```text
Error: listen EADDRINUSE: address already in use :::3010
```

### Cause

Another Node.js process is already using port `3010`.

### Solution

In CMD:

```cmd
netstat -ano | findstr :3010
```

Find the PID:

```text
TCP    0.0.0.0:3010    0.0.0.0:0    LISTENING    228172
```

Kill the PID:

```cmd
taskkill /PID 228172 /F
```

Check again:

```cmd
netstat -ano | findstr :3010
```

If nothing appears, restart server:

```cmd
npm run dev
```

### Note

If using Git Bash and `cmd.exe /c` opens CMD unexpectedly, use the current CMD prompt directly.

---

## 2.3 Server Runs in CMD Instead of Git Bash

### Symptom

Prompt changes from:

```bash
Pc@DESKTOP-03OQL8T MINGW64 /z/01. Ai_Memory_System/api
$
```

to:

```cmd
Z:\01. Ai_Memory_System\api>
```

### Cause

Windows CMD was opened from Git Bash.

### Solution

If already in CMD, commands should use Windows path style.

Correct in CMD:

```cmd
npm run dev
```

Incorrect in CMD:

```cmd
cd "/z/01. Ai_Memory_System/api"
```

To return to Git Bash:

```cmd
exit
```

---

# 3. Admin Page Access Issues

## 3.1 `Route not found: GET /admin/index.html`

### Error Example

```json
{
  "ok": false,
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "Route not found: GET /admin/index.html"
  }
}
```

### Cause

Express static route for `/admin` is not connected or is placed after the 404 handler.

### Solution

In `src/app.js`, confirm this exists before 404 handler:

```js
const path = require("path");
const adminAuthMiddleware = require("./middlewares/admin-auth.middleware");

app.use(
  "/admin",
  adminAuthMiddleware,
  express.static(path.join(__dirname, "public/admin"))
);
```

### Check

```bash
node --check src/app.js
```

Restart server.

---

## 3.2 Admin Page Opens but CSS/JS Does Not Load

### Cause

Admin auth middleware may be blocking static files.

### Solution

`src/middlewares/admin-auth.middleware.js` must allow static assets:

```js
if (
  path.startsWith("/css/") ||
  path.startsWith("/js/") ||
  path.endsWith(".css") ||
  path.endsWith(".js")
) {
  return next();
}
```

### Normal Result

Admin page loads with full layout and buttons.

---

## 3.3 Admin Login Appears Even With Correct Token

### Cause Checklist

| Cause                | Check                             |
| -------------------- | --------------------------------- |
| Wrong token          | Compare with `.env` `ADMIN_TOKEN` |
| Server not restarted | Restart after changing `.env`     |
| Query missing        | Use `/admin?token=YOUR_TOKEN`     |
| `.env` not loaded    | Check server startup logs         |
| Spaces in token      | Remove unnecessary spaces         |

### Correct URL

```text
http://localhost:3010/admin?token=YOUR_ADMIN_TOKEN
```

---

# 4. Admin Token / API Protection Issues

## 4.1 Token Without Access

### Symptom

Admin page opens, but API actions fail.

### Cause

`api.js` may not be sending `x-admin-token`.

### Check

Browser:

1. Press `F12`
2. Open `Network`
3. Click `Load Queue`
4. Select `/ai/summary/queue`
5. Check Request Headers

Expected:

```text
x-admin-token: YOUR_ADMIN_TOKEN
```

### Solution

Confirm `src/public/admin/js/api.js` includes token injection:

```js
headers["x-admin-token"] = token;
```

---

## 4.2 Protected API Does Not Return 401 Without Token

### Expected Result

Tokenless request to protected API should return:

```json
{
  "ok": false,
  "error": {
    "code": "ADMIN_UNAUTHORIZED",
    "message": "Valid admin token is required."
  }
}
```

### If It Returns Something Else

Example:

```json
{
  "ok": false,
  "error": "Memory not found."
}
```

### Cause

The route may not have `adminApiAuthMiddleware`.

### Check

```bash
grep -n "memory/save\|adminApiAuthMiddleware" src/routes/ai.routes.js
```

Correct:

```js
router.post("/memory/save", adminApiAuthMiddleware, async (req, res, next) => {
```

Incorrect:

```js
router.post("/memory/save", async (req, res, next) => {
```

### Solution

Add middleware to protected POST/PATCH routes.

---

## 4.3 Protected API Works Without Token

### Cause

The route is not protected.

### Protected APIs Should Include

```js
adminApiAuthMiddleware
```

Protected list:

```text
POST /ai/memory/save
PATCH /ai/memory/:id/status
POST /ai/summary/retry-failed
POST /ai/project/assets
PATCH /ai/project/assets/:id
POST /ai/context/preview
POST /ai/context/rebuild
```

### After Modification

Run:

```bash
node --check src/routes/ai.routes.js
```

Restart server.

---

# 5. Browser Cache Issues

## 5.1 Button Does Nothing

### Symptom

Clicking button does not change the screen.

### Possible Causes

| Cause                           | Solution                              |
| ------------------------------- | ------------------------------------- |
| Browser uses old JS             | Press `Ctrl + F5`                     |
| `dashboard.js` has syntax error | Run `node --check`                    |
| Button ID mismatch              | Check `index.html` and `dashboard.js` |
| Event listener missing          | Check `DOMContentLoaded`              |

### Check JS Syntax

```bash
node --check src/public/admin/js/dashboard.js
```

### Check Button IDs

Example:

```bash
grep -n "runContextPreviewBtn\|runContextRebuildBtn" src/public/admin/index.html
grep -n "runContextPreviewBtn\|runContextRebuildBtn" src/public/admin/js/dashboard.js
```

---

## 5.2 Updated Code Not Reflected

### Solution

Update script version in `index.html`.

Example:

```html
<script src="/admin/js/api.js?v=20260606-2"></script>
<script src="/admin/js/dashboard.js?v=20260606-2"></script>
```

Then press:

```text
Ctrl + F5
```

---

# 6. Dashboard Issues

## 6.1 Dashboard Shows ERROR

### Cause

One of these APIs may be failing:

```text
GET /health
GET /health/db
GET /ai/system/status
```

### Check Manually

Open in browser:

```text
http://localhost:3010/health
http://localhost:3010/health/db
http://localhost:3010/ai/system/status
```

### Common Causes

| Error              | Meaning               |
| ------------------ | --------------------- |
| DB error           | MariaDB not connected |
| Route not found    | route missing         |
| 500 error          | backend exception     |
| Server not running | restart server        |

---

## 6.2 Dashboard Count Cards Show 0

### Cause

The related APIs may return empty arrays or parsing failed.

### Related APIs

```text
GET /ai/summary/queue
GET /ai/memory/recent?project_code=rbs_ai_memory
GET /ai/project/rbs_ai_memory/assets
```

### Solution

Open each API directly and check whether `results` or another key contains data.

---

# 7. Summary Queue Issues

## 7.1 Load Queue Shows `No queue data found`

### Cause

No rows match selected filter.

### Check

Select:

```text
all
```

Then click:

```text
Load Queue
```

If `completed` has data but `failed` has none, it is normal.

---

## 7.2 Failed Filter Shows No Data

### Message

```text
No failed queue found. This is normal.
```

### Meaning

There is no failed summary queue.

This is normal.

---

## 7.3 Retry Failed Does Not Work

### Possible Causes

| Cause                           | Solution                  |
| ------------------------------- | ------------------------- |
| No failed queue                 | Normal                    |
| Missing token                   | Check `x-admin-token`     |
| API route unprotected or broken | Check route               |
| Worker issue                    | Check summary worker logs |

### API

```text
POST /ai/summary/retry-failed
```

### Token Required

```text
x-admin-token
```

---

## 7.4 Queue Detail Appears Twice

### Cause

`Queue Detail` panel was added twice in `index.html`.

### Check

```bash
grep -n "queueDetailOutput" src/public/admin/index.html
```

Expected: one line only.

### Solution

Delete duplicate `Queue Detail` block and keep only the one below queue table.

---

# 8. Memory Manager Issues

## 8.1 Recent Memory API Returns `project_code is required`

### Cause

The API requires project code.

### Correct API

```text
GET /ai/memory/recent?project_code=rbs_ai_memory
```

### Solution

In `dashboard.js`, use:

```js
AdminAPI.get(`/ai/memory/recent?project_code=${encodeURIComponent(projectCode)}`)
```

---

## 8.2 Memory Search Shows No Data

### Possible Causes

| Cause               | Solution            |
| ------------------- | ------------------- |
| Empty keyword       | Enter keyword       |
| Wrong status filter | Try `all`           |
| Wrong project_code  | Use `rbs_ai_memory` |
| No matching memory  | Normal              |

---

## 8.3 Archived Memory Disappears

### Cause

Archived memory no longer appears in active list.

### Solution

Select status filter:

```text
archived
```

Then click:

```text
Load Recent Memory
```

To restore:

```text
Activate
```

---

## 8.4 Save Manual Memory Shows `title is required`

### Cause

Title field is empty.

### Required Fields

```text
Project Code
Title
Summary
```

### Solution

Fill all fields before clicking:

```text
Save Manual Memory
```

---

## 8.5 Memory Status Update Does Not Work

### Possible Causes

| Cause                         | Solution                        |
| ----------------------------- | ------------------------------- |
| Missing token                 | Check `x-admin-token`           |
| Invalid status                | Use active / archived / deleted |
| Memory ID does not exist      | Load recent memory again        |
| Route not protected correctly | Check route                     |

### API

```text
PATCH /ai/memory/:id/status
```

Example body:

```json
{
  "status": "archived"
}
```

---

# 9. Project Assets Issues

## 9.1 Load Assets Shows `No asset data found`

### Possible Causes

| Cause                       | Meaning                      |
| --------------------------- | ---------------------------- |
| No rows in `project_assets` | Normal before asset creation |
| Wrong project_code          | Use correct project          |
| API parsing issue           | Check API response           |

### Direct API Check

```text
http://localhost:3010/ai/project/rbs_ai_memory/assets
```

---

## 9.2 `Unknown column 'updated_at' in 'field list'`

### Error Example

```text
Unknown column 'updated_at' in 'field list'
```

### Cause

Backend SQL expects `updated_at`, but `project_assets` table does not have it.

### Solution

In DBeaver:

```sql
ALTER TABLE project_assets
ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
```

Then:

```sql
UPDATE project_assets
SET updated_at = created_at
WHERE updated_at IS NULL;
```

---

## 9.3 Create Asset Shows `title is required`

### Cause

Asset title field is empty.

### Required Fields

```text
Project Code
Asset Type
Title
Content
Priority
```

### Solution

Fill title and content before clicking:

```text
Create Asset
```

---

## 9.4 Update Asset Shows `Please select an asset first`

### Cause

Update Asset was clicked before selecting an asset.

### Correct Procedure

1. Click `Load Assets`
2. Click `Edit` on an asset row
3. Modify fields
4. Click `Update Asset`

---

## 9.5 Project Asset Update Fails With Column Error

### Cause

Backend API and DB schema mismatch.

### Check Table

```sql
DESCRIBE project_assets;
```

Expected columns may include:

```text
id
project_code
asset_type
title
content
priority
is_active
created_at
updated_at
```

---

# 10. Conversation Logs Issues

## 10.1 Load Session Logs Shows No Data

### Possible Causes

| Cause                     | Solution               |
| ------------------------- | ---------------------- |
| Wrong session_id          | Check exact session_id |
| No logs saved             | Normal                 |
| API response key mismatch | Check API response     |

### Direct API Check

```text
http://localhost:3010/ai/session/phase-5c-final-test-001
```

### DB Check

```sql
SELECT *
FROM ai_conversation_logs
WHERE session_id = 'phase-5c-final-test-001'
ORDER BY id DESC;
```

---

## 10.2 Linked Memory Does Not Appear

### Possible Causes

| Cause                          | Meaning                      |
| ------------------------------ | ---------------------------- |
| No memory link exists          | Normal                       |
| `ai_memory_links` empty        | Summary linking not created  |
| Wrong conversation id          | Check row ID                 |
| API response structure changed | Check `/ai/conversation/:id` |

### Direct API

```text
GET /ai/conversation/:id
```

Expected fields:

```text
linked_memories_count
linked_memories
```

---

# 11. Context Preview Issues

## 11.1 `question is required`

### Cause

Question field is empty or payload field name is wrong.

### Required Fields

```text
project_code
session_id
question
```

### Correct Body

```json
{
  "project_code": "rbs_ai_memory",
  "session_id": "phase-5c-final-test-001",
  "question": "Check whether saved memory can be recalled."
}
```

---

## 11.2 Context Preview Returns Unauthorized

### Cause

`POST /ai/context/preview` is protected.

### Solution

Admin console should send:

```text
x-admin-token
```

If testing with Postman, manually add header.

---

## 11.3 Context Preview Result Does Not Include Memory

### Possible Causes

| Cause                          | Solution                |
| ------------------------------ | ----------------------- |
| No relevant memory             | Search Memory manually  |
| Wrong project_code             | Use `rbs_ai_memory`     |
| Wrong session_id               | Check Conversation Logs |
| Memory status archived/deleted | Filter by all or active |
| Project assets missing         | Load Assets             |

---

# 12. Context Rebuild Issues

## 12.1 `project_code, session_id, and question are required`

### Cause

Context Rebuild form originally had only project_code and session_id.

### Solution

Add Question field to Context Rebuild section.

Required fields:

```text
project_code
session_id
question
```

Correct body:

```json
{
  "project_code": "rbs_ai_memory",
  "session_id": "phase-5c-final-test-001",
  "question": "Check whether context rebuild works correctly."
}
```

---

## 12.2 Context Rebuild Route Not Found

### Error Example

```json
{
  "ok": false,
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "Route not found: POST /ai/context/rebuild"
  }
}
```

### Cause

Backend route is missing or URL is wrong.

### Check

```bash
grep -n "context/rebuild\|rebuild" src/routes/ai.routes.js
```

---

## 12.3 Context Rebuild Unauthorized

### Cause

`POST /ai/context/rebuild` is protected.

### Solution

Admin Console must send `x-admin-token`.

Postman must include:

```text
x-admin-token: YOUR_ADMIN_TOKEN
```

---

# 13. Database Schema Issues

## 13.1 Unknown Column Error

### Example

```text
Unknown column 'updated_at' in 'field list'
```

### Meaning

Backend SQL references a column that does not exist in DB.

### Solution Procedure

1. Check table:

```sql
DESCRIBE table_name;
```

2. Either add missing column or adjust SQL.

Example:

```sql
ALTER TABLE project_assets
ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
```

---

## 13.2 Data Exists in DB but Not in Admin Screen

### Possible Causes

| Cause                       | Solution               |
| --------------------------- | ---------------------- |
| Wrong project_code          | Check project_code     |
| Status filter excludes row  | Select `all`           |
| API returns different key   | Check API JSON         |
| Frontend parser missing key | Update `extractRows()` |
| Browser cache               | `Ctrl + F5`            |

### Direct Check

Open the API directly in browser or Postman.

---

# 14. Postman Testing Issues

## 14.1 Protected API Does Not Return 401

### Cause

Route may not have admin middleware.

### Check

```bash
grep -n "memory/save\|context/rebuild\|adminApiAuthMiddleware" src/routes/ai.routes.js
```

### Correct Pattern

```js
router.post("/memory/save", adminApiAuthMiddleware, async (req, res, next) => {
```

---

## 14.2 Postman Request Reaches Wrong Route

### Symptom

Calling:

```text
POST /ai/memory/save
```

returns:

```json
{
  "ok": false,
  "error": "Memory not found."
}
```

### Possible Cause

Route order may cause `save` to be treated as `:id`.

### Solution

Place specific routes before dynamic routes.

Correct order:

```js
router.post("/memory/save", adminApiAuthMiddleware, async ...);

router.get("/memory/recent", async ...);

router.get("/memory/search", async ...);

router.get("/memory/:id", async ...);

router.patch("/memory/:id/status", adminApiAuthMiddleware, async ...);
```

---

# 15. Recommended Debug Commands

## 15.1 Check Server Port

```cmd
netstat -ano | findstr :3010
```

## 15.2 Kill Process

```cmd
taskkill /PID ACTUAL_PID /F
```

## 15.3 Check JS Syntax

```bash
node --check src/public/admin/js/api.js
node --check src/public/admin/js/dashboard.js
```

## 15.4 Check Backend Syntax

```bash
node --check src/app.js
node --check src/routes/ai.routes.js
node --check src/middlewares/admin-auth.middleware.js
node --check src/middlewares/admin-api-auth.middleware.js
```

## 15.5 Find Routes

```bash
grep -n "memory/save\|context/preview\|context/rebuild\|project/assets" src/routes/ai.routes.js
```

## 15.6 Find HTML Elements

```bash
grep -n "linkedMemoryOutput\|contextPreviewOutput\|contextRebuildOutput" src/public/admin/index.html
```

---

# 16. Final Troubleshooting Checklist

When something does not work, check in this order:

```markdown
- [ ] Is the server running on port 3010?
- [ ] Is the correct folder being used?
- [ ] Is the port already occupied?
- [ ] Was the server restarted after backend or .env changes?
- [ ] Was `Ctrl + F5` used after frontend changes?
- [ ] Does `node --check` pass?
- [ ] Does the HTML element ID exist?
- [ ] Does the JS event listener exist?
- [ ] Does the direct API call work in browser/Postman?
- [ ] Is the correct `project_code` used?
- [ ] Is the correct `session_id` used?
- [ ] Is the correct status filter selected?
- [ ] Is `x-admin-token` included for protected APIs?
- [ ] Does the DB table contain the expected columns?
- [ ] Does the DB table contain matching rows?
```

---

# 17. Phase 8 Troubleshooting Status

| Area                 | Troubleshooting Documented |
| -------------------- | -------------------------- |
| Server startup       | Yes                        |
| Port conflict        | Yes                        |
| Admin page access    | Yes                        |
| Admin token login    | Yes                        |
| Admin API protection | Yes                        |
| Browser cache        | Yes                        |
| Dashboard            | Yes                        |
| Summary Queue        | Yes                        |
| Memory Manager       | Yes                        |
| Project Assets       | Yes                        |
| Conversation Logs    | Yes                        |
| Context Preview      | Yes                        |
| Context Rebuild      | Yes                        |
| Database schema      | Yes                        |
| Postman test         | Yes                        |
