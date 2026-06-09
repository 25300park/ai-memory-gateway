# AI Memory Gateway Phase 10-4

## Context Assembly Advanced

Phase 10-4 adds a production-oriented context assembly layer.

### Main API

```txt
POST /ai/context/assembly
GET  /ai/context/assembly
```

### Purpose

This API combines the three memory layers before an AI response request:

1. Project Assets
2. Recent Buffer
3. Summarized Memory

It returns:

- quality status
- quality score
- selected layers
- assembly trace
- warnings
- assembled prompt
- full JSON result

### Admin Console

A new menu is added:

```txt
Context Assembly
```

### Layout Fix

Phase 10-4 also fixes the AI Pipeline Draft metric cards so long values such as `READY_WITH_WARNINGS` do not overflow their card.

### Floating Top Button

A floating `↑ Top` button is added to the left bottom of the page.
