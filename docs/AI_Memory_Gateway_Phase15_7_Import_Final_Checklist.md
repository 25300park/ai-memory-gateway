# AI Memory Gateway - Phase 15-7 Import Final Checklist

## Purpose

Phase 15-7 verifies that the imported conversation pipeline is ready for practical use.

This phase checks:

- Imported conversation storage tables
- ChatGPT export ZIP importer result
- Imported messages storage
- Summary queue linkage
- Summary worker memory generation readiness
- Import Memory Search availability
- Import Quality Review / duplicate scan readiness
- Gemini / Claude importer preparation status

## Admin Console Menu

Memory Operation → Phase 15 Final

## APIs

### Status

```http
GET /ai/imports/final/status
x-admin-token: <ADMIN_TOKEN>
```

### Checklist

```http
GET /ai/imports/final/checklist
x-admin-token: <ADMIN_TOKEN>
```

### Test

```http
POST /ai/imports/final/test
x-admin-token: <ADMIN_TOKEN>
Content-Type: application/json

{}
```

## Completion Result

A successful Phase 15 final decision returns one of these statuses:

- `PHASE15_COMPLETED`
- `COMPLETED_WITH_MANUAL_CHECKS`

Both statuses allow the project to continue to Phase 16.

## Manual Checks

The following items may remain as manual checks:

1. Real ChatGPT export ZIP import after the email download link arrives.
2. Gemini Takeout real file import.
3. Claude export real file import.
4. Full summary worker processing for all imported conversations.
5. Duplicate candidate review after full import.

## Recommended Next Phase

Phase 16 should focus on real usage workflow:

- How to load memory context for a new ChatGPT / Gemini / Claude session.
- How to choose project_code.
- How to assemble a context packet.
- How to store follow-up conversations back into AI Memory Gateway.
- How to move the service from local development PC to 24-hour mini PC.
