# AI Memory Gateway - Phase 13-3A Backup UI CSS + Button Feedback Fix

## Purpose
This patch fixes the Admin Console layout issue found after Phase 13-2/13-3.

## Fixes
- Restores grouped sidebar menu layout.
- Adds CSS for `nav-group`, `nav-group-title`, `metrics-grid`, `metric-card`, `action-row`, backup form fields, and backup panels.
- Adds visible loading feedback to Backup Status buttons.
- Adds disabled/loading state for buttons while API calls are running.
- Adds status color classes for Backup Status / Backup History Status.

## Files
- `src/public/admin/css/admin.css`
- `src/public/admin/js/dashboard.js`

## Test
1. Restart server.
2. Open Admin Console.
3. Confirm sidebar menu is vertical and grouped.
4. Go to Backup / Monitoring → DB Backup Status.
5. Click Load Backup Status.
6. Button should temporarily show `Loading...` and values should refresh.
