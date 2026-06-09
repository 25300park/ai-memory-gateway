# AI Memory Gateway - Phase 15-2A ChatGPT Import Batch Insert Fix

## Purpose

Fixes the ChatGPT import batch INSERT statement where the number of columns did not match the number of values.

## Error Fixed

```txt
ER_WRONG_VALUE_COUNT_ON_ROW / SQLState 21S01
Column count doesn't match value count at row 1
```

## Changed File

```txt
src/services/chatgpt-export-importer.service.js
```

## Validation

Retry:

```txt
POST /ai/imports/chatgpt/import
```

with a valid ChatGPT export sample ZIP path and `limit: 3`.
