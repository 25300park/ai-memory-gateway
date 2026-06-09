# AI Memory Gateway - Phase 13-7 Alert Rules Preparation

## Goal
Prepare operational alert rules based on monitoring data from Phase 13-5 and Phase 13-6.

## Added Admin Menu
Backup / Monitoring → Alert Rules

## Added APIs
- GET /ai/monitoring/alerts/status
- GET /ai/monitoring/alerts/catalog
- GET /ai/monitoring/alerts/checklist
- POST /ai/monitoring/alerts/test

## Alert Categories
- database
- queue
- backup
- disk
- operation_logs
- worker

## Recommended Environment Variables
- ALERT_DB_LATENCY_MS=1000
- ALERT_SUMMARY_QUEUE_FAILED_COUNT=1
- ALERT_SUMMARY_QUEUE_PENDING_COUNT=20
- ALERT_STUCK_PROCESSING_COUNT=1
- ALERT_BACKUP_MAX_AGE_HOURS=24
- ALERT_DISK_FREE_MIN_PERCENT=15
- ALERT_OPERATION_ERRORS_24H=1

## Notes
This phase does not send external notifications yet. It prepares alert evaluation and operator action output. Actual alert delivery can be connected later to Telegram, email, admin notifications, or another channel.
