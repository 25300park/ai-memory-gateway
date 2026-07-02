# Phase 17 Index Restore Upgrade

This patch restores the full Admin Console index.html from the stable Phase 17-2 dashboard and adds safe Phase 17-3 through Phase 17-7 Personal AI Agent UI controls without replacing backend routes or services.

## Added UI controls

- Context Search
- Ask Agent
- Continue Project
- Continue Test
- Usage History
- Operation Logs
- Operation Log Test
- Recent Limit
- Live provider toggle
- Allow fallback toggle
- Queue summary toggle

## Scope

Only `src/public/admin/index.html` is changed. Backend files are not modified.
