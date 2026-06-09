# AI Memory Gateway Phase 12-7

## Admin Console Production Mode / Dev Mode Separation

This phase separates daily operation menus from developer / diagnostic menus without deleting diagnostic code.

## New APIs

- `GET /ai/security/admin-console/mode/status`
- `GET /ai/security/admin-console/mode/checklist`
- `POST /ai/security/admin-console/mode/test`

All APIs are protected by `x-admin-token`.

## Recommended `.env`

### Development

```env
ADMIN_CONSOLE_MODE=development
ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS=false
ADMIN_ALLOW_URL_DEV_MODE=true
```

### Production

```env
ADMIN_CONSOLE_MODE=production
ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS=true
ADMIN_SHOW_DEVELOPER_MENU=false
ADMIN_ALLOW_URL_DEV_MODE=true
ADMIN_DEV_MODE_TOKEN=set-long-dev-mode-token
```

## Behavior

- In development mode, developer / diagnostic menus are visible by default.
- In production mode, developer / diagnostic menus are hidden by default.
- Diagnostic code is preserved for troubleshooting.
- With `&dev=1`, authorized admins can reveal diagnostic menus when URL dev mode is allowed.

## Developer / Diagnostic Menus

- Context Build
- Context Preview
- Context Assembly
- AI Pipeline Draft
- Phase 10 Final
- Provider Router
- Provider Fallback
- Phase 11 Final
- Admin Permissions
- Dangerous Actions
- API Errors
- Environment Config
- Production Deployment
- Context Rebuild
- System Status

## Completion Criteria

- Admin Console Mode menu is visible.
- Mode status API works.
- Mode checklist API works.
- Mode test API works.
- Production mode hides developer / diagnostic menus.
- `&dev=1` restores diagnostic menus when enabled.
- Operation menus remain visible.
