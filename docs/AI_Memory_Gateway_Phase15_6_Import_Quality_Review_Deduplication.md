# AI Memory Gateway - Phase 15-6 Import Quality Review / Deduplication

## Goal

Phase 15-6 adds an operational review layer for imported conversations before Phase 15 is finalized.

This phase verifies:

- imported conversation storage availability
- duplicate candidate detection by `content_hash`
- stored message count consistency
- import failure visibility
- summary queue linkage visibility
- ai_memory linkage visibility
- review status tracking

## Admin Console Menu

Memory Operation → Import Quality Review

## API Endpoints

```txt
GET  /ai/imports/quality-review/status
GET  /ai/imports/quality-review/checklist
POST /ai/imports/quality-review/review
POST /ai/imports/quality-review/duplicates
POST /ai/imports/quality-review/test
```

All endpoints require `x-admin-token`.

## Quality Review Request

```json
{
  "project_code": "rbs_ai_memory",
  "source_platform": "all",
  "review_status": "all",
  "keyword": "",
  "limit": 20
}
```

## Duplicate Scan Request

Dry-run first:

```json
{
  "project_code": "rbs_ai_memory",
  "source_platform": "all",
  "dry_run": true,
  "limit": 20
}
```

To mark duplicate candidates:

```json
{
  "project_code": "rbs_ai_memory",
  "source_platform": "all",
  "dry_run": false,
  "limit": 20
}
```

When `dry_run=false`, rows in duplicate hash groups are marked with:

```txt
review_status = duplicate_candidate
```

## Quality Status Values

```txt
OK
FAILED_IMPORT
DUPLICATE_CANDIDATE
MESSAGE_COUNT_MISMATCH
NOT_QUEUED
QUEUED_NOT_MEMORY
```

## Completion Criteria

```txt
[ ] Import Quality Review menu visible
[ ] Status API returns READY
[ ] Checklist API returns PASS for required items
[ ] Review API returns imported conversation rows
[ ] Duplicate scan dry_run works
[ ] Duplicate candidate marking works if needed
[ ] Summary queue / memory linkage is visible
[ ] phase15_7_entry_allowed: true
```

## Next Phase

Phase 15-7: Import Final Checklist
