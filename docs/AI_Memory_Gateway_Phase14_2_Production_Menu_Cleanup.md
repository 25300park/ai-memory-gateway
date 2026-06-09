# AI Memory Gateway Phase 14-2

## Production Admin Menu Cleanup

This phase finalizes the Admin Console menu structure before final production handoff.

### Added APIs

- `GET /ai/system/phase14-menu-cleanup/status`
- `GET /ai/system/phase14-menu-cleanup/checklist`
- `POST /ai/system/phase14-menu-cleanup/test`

### Purpose

- Keep operational menus visible for daily use.
- Keep Developer / Diagnostic tools in the codebase.
- Hide Developer / Diagnostic tools by default in production mode.
- Allow temporary diagnostic access with `&dev=1` when configured.

### Recommended production `.env`

```env
ADMIN_CONSOLE_MODE=production
ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS=true
ADMIN_SHOW_DEVELOPER_MENU=false
ADMIN_ALLOW_URL_DEV_MODE=true
ADMIN_DEV_MODE_TOKEN=change_this_to_a_long_private_value
```

### Normal production URL

```txt
/admin?token=ADMIN_TOKEN
```

### Diagnostic URL

```txt
/admin?token=ADMIN_TOKEN&dev=1
```

### Completion rule

Phase 14-2 is complete when:

- Production menu groups load correctly.
- Developer / Diagnostic menu inventory is defined.
- Production mode can hide developer menus.
- `phase14_3_entry_allowed` is true.
