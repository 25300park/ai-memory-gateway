# AI Memory Gateway - Phase 15-2 ChatGPT Export ZIP Importer

## Goal

Phase 15-2 adds a ChatGPT export ZIP importer to AI Memory Gateway.

This phase reads `conversations.json` from a ChatGPT data export ZIP and stores the data into the Phase 15-1 imported conversation storage tables.

## Added Admin Menu

Memory Operation > ChatGPT Importer

## Added APIs

- `GET /ai/imports/chatgpt/status`
- `GET /ai/imports/chatgpt/checklist`
- `POST /ai/imports/chatgpt/test`
- `POST /ai/imports/chatgpt/import`

All routes are protected by `x-admin-token`.

## Dependency

This importer uses `adm-zip` to read ChatGPT export ZIP files.

Run once in the API folder:

```bash
cd "/z/01. Ai_Memory_System/api"
npm install adm-zip
```

Then restart the server:

```bash
npm run dev
```

If `adm-zip` is missing, the server still starts. The importer status will return `ACTION_REQUIRED` with this install command.

## Import Flow

1. Export ChatGPT data from ChatGPT settings.
2. Download the ZIP file.
3. Put the ZIP file on the server PC, for example:
   - `Z:\01. Ai_Memory_System\imports\chatgpt_export.zip`
4. Open Admin Console.
5. Go to Memory Operation > ChatGPT Importer.
6. Run `Load ChatGPT Importer Status`.
7. Run `Run Parser Test`.
8. Enter the ZIP file path and project code.
9. Click `Run ChatGPT ZIP Import`.

## Postman Test

### Status

```http
GET http://localhost:3010/ai/imports/chatgpt/status
x-admin-token: AI_Basic_Zarvis_2026
```

### Parser Test

```http
POST http://localhost:3010/ai/imports/chatgpt/test
x-admin-token: AI_Basic_Zarvis_2026
Content-Type: application/json
```

Body:

```json
{
  "scenario": "synthetic_parser"
}
```

Expected:

```txt
test_status: PASS
```

### Import ZIP

```http
POST http://localhost:3010/ai/imports/chatgpt/import
x-admin-token: AI_Basic_Zarvis_2026
Content-Type: application/json
```

Body:

```json
{
  "zip_file_path": "Z:\\01. Ai_Memory_System\\imports\\chatgpt_export.zip",
  "project_code": "rbs_ai_memory",
  "skip_duplicates": true,
  "limit": 0
}
```

For a small test first, set `limit` to 3.

```json
{
  "zip_file_path": "Z:\\01. Ai_Memory_System\\imports\\chatgpt_export.zip",
  "project_code": "rbs_ai_memory",
  "skip_duplicates": true,
  "limit": 3
}
```

## Stored Data

- `imported_conversation_batches`
  - Tracks one import job per ZIP file.
- `raw_imported_conversations`
  - Stores original conversation JSON, normalized text, title, source id, project code, content hash.
- `imported_conversation_messages`
  - Stores normalized message rows in order.

## Duplicate Handling

The importer creates a SHA-256 `content_hash` from:

```txt
source platform + source conversation id + title + normalized text
```

If `skip_duplicates` is true, already imported conversations are skipped.

## Completion Criteria

- ChatGPT Importer menu appears.
- Status API works.
- Checklist API works.
- Parser Test returns PASS.
- `adm-zip` dependency is installed.
- Import ZIP API imports conversations into DB.
- Imported rows appear in:
  - `imported_conversation_batches`
  - `raw_imported_conversations`
  - `imported_conversation_messages`

## Next Phase

Phase 15-3 will connect imported conversations to `ai_summary_queue`, so old ChatGPT conversations can be converted into long-term `ai_memory`.
