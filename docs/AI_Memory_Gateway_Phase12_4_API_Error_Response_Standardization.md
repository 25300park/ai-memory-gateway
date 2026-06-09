# AI Memory Gateway - Phase 12-4 API Error Response Standardization

## Goal

Phase 12-4 standardizes API error responses across Admin API, security middleware, 404 handler, and global error handler.

## Standard Error Shape

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "type": "client_error",
    "severity": "low",
    "http_status": 400,
    "request_id": "optional-request-id",
    "timestamp": "2026-06-07T00:00:00.000Z",
    "path": "/ai/example",
    "method": "POST",
    "source": "subsystem-name",
    "operator_action": "Recommended operator action",
    "details": {}
  }
}
```

## New APIs

- `GET /ai/security/api-errors/status`
- `GET /ai/security/api-errors/catalog`
- `GET /ai/security/api-errors/examples`
- `POST /ai/security/api-errors/test`

All endpoints require `x-admin-token`.

## Test Body

```json
{
  "scenario": "validation"
}
```

Supported scenarios:

- `validation`
- `permission`
- `dangerous`
- `provider`
- `internal`

## Files Changed

- `src/services/api-error.service.js`
- `src/utils/response.util.js`
- `src/middlewares/error.middleware.js`
- `src/middlewares/admin-api-auth.middleware.js`
- `src/routes/ai.routes.js`
- `src/public/admin/index.html`
- `src/public/admin/js/dashboard.js`
- `src/public/admin/css/admin.css`

## Completion Criteria

- API Errors menu appears.
- Status / Catalog / Examples endpoints work.
- Error Test returns standardized error payload.
- Missing admin token returns standardized 401.
- Invalid admin token returns standardized 403.
- Unknown route returns standardized 404.
- Existing Admin Security / Permissions / Dangerous Actions pages continue to work.
