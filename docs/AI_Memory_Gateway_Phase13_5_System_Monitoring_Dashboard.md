# AI Memory Gateway - Phase 13-5 System Monitoring Dashboard

## Goal
Add a single Admin Console dashboard that summarizes runtime, DB, queue, memory, backup, and operation log health.

## APIs
- GET /ai/monitoring/system
- GET /ai/monitoring/checklist
- POST /ai/monitoring/test

## Dashboard checks
- DB connectivity and latency
- Summary queue pending / processing / completed / failed counts
- AI memory, recent buffer, conversation logs, project assets counts
- Backup directory and latest backup file summary
- Operation log error/warning count in last 24h
- Node process uptime, memory usage, PID, host, system memory

## Env thresholds
- MONITOR_QUEUE_PENDING_WARNING=20
- MONITOR_QUEUE_FAILED_WARNING=1
- MONITOR_DB_LATENCY_WARNING_MS=1000
- MONITOR_MEMORY_FREE_WARNING_PERCENT=10
- MONITOR_OPERATION_ERROR_WARNING_24H=1

## Notes
This phase does not send alerts yet. Alert rules are prepared in Phase 13-7.
