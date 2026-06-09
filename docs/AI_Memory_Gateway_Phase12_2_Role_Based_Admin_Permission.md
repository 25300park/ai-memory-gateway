# AI Memory Gateway - Phase 12-2 Role-based Admin Permission

## Goal
Phase 12-2 adds a role-based admin permission structure on top of the existing `x-admin-token` protection.

This phase prepares the system for safer production operation by mapping accepted admin tokens to roles and defining a permission catalog.

## New files

- `src/services/admin-permission.service.js`

## Updated files

- `src/middlewares/admin-api-auth.middleware.js`
- `src/middlewares/admin-auth.middleware.js`
- `src/routes/ai.routes.js`
- `src/public/admin/index.html`
- `src/public/admin/js/dashboard.js`
- `src/public/admin/css/admin.css`

## New Admin Console menu

- Admin Permissions

## New APIs

All APIs require `x-admin-token`.

```txt
GET  /ai/security/admin/permissions/status
GET  /ai/security/admin/permissions/roles
GET  /ai/security/admin/permissions/policies
POST /ai/security/admin/permissions/check
GET  /ai/security/admin/permissions/events?limit=50
```

## Default role mapping

```env
ADMIN_PRIMARY_ROLE=super_admin
ADMIN_SECONDARY_ROLE=admin
ADMIN_DEFAULT_ROLE=viewer
```

If these values are not set, the defaults are:

```txt
primary token   -> super_admin
secondary token -> admin
unknown token   -> viewer
```

## Roles

```txt
super_admin: full access
admin: daily operation + memory + summary + provider tests, no dangerous full control by default
operator: daily operation and queue operation
viewer: read-only dashboard/report/status role
developer: context, pipeline, provider diagnostic role
```

## Important note

Phase 12-2 prepares the role and permission structure. Full per-route enforcement should be introduced gradually in Phase 12-3 and Phase 12-4, starting with dangerous POST/PATCH actions.

## DBeaver checks

```sql
SHOW TABLES LIKE 'ai_admin_permission_events';

SELECT *
FROM ai_admin_permission_events
ORDER BY id DESC
LIMIT 20;
```

## Completion checklist

```txt
[ ] Admin Permissions menu is visible
[ ] Permission Status API works
[ ] Roles Matrix API works
[ ] Policies API works
[ ] Permission Check API works
[ ] Permission Events table is created
[ ] Current token role is displayed
[ ] Existing Admin Security menu still works
```
