# Phase 14-4A Router / Dashboard Restore Fix

This patch repairs the Phase 14-4 snippet overwrite issue.

## Fixed
- Restores full `src/routes/ai.routes.js` from Phase 14-3 and appends Phase 14-4 operator manual routes.
- Restores full Admin Console `index.html` and adds Operator Manual section.
- Restores full `dashboard.js` from the latest Phase 13 UI patch and adds Phase 14-4 helper functions.
- Restores full `admin.css` from Phase 14-3 and appends Phase 14-4 styles.

## Error resolved
`ReferenceError: router is not defined` caused by overwriting `ai.routes.js` with a snippet-only file.
