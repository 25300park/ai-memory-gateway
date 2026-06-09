# AI Memory Gateway - Phase 13-6

## Disk / DB / Queue / Worker 상태 모니터링

### 추가 API

- `GET /ai/monitoring/detailed`
- `GET /ai/monitoring/worker-status`
- `GET /ai/monitoring/resource-checklist`
- `POST /ai/monitoring/detailed/test`

모든 API는 `x-admin-token` 보호를 사용합니다.

### Admin Console

Backup / Monitoring 그룹에 `Resource Monitoring` 메뉴가 추가됩니다.

### 점검 항목

- Disk: backup directory 기준 total/free/used/percent
- DB: latency, size, table count, connections, DB uptime
- Queue: pending/processing/completed/failed, oldest pending, stuck processing
- Worker: API server, summary worker, daily operation worker evidence

### 권장 환경변수

```env
MONITOR_DISK_FREE_WARNING_PERCENT=15
MONITOR_PROCESSING_STUCK_MINUTES=30
MONITOR_DB_LATENCY_WARNING_MS=1000
MONITOR_QUEUE_FAILED_WARNING=1
```

### Postman

```txt
GET http://localhost:3010/ai/monitoring/detailed
```

```txt
GET http://localhost:3010/ai/monitoring/worker-status
```

```txt
POST http://localhost:3010/ai/monitoring/detailed/test
```

```json
{
  "scenario": "current"
}
```

Scenario options:

- `current`
- `disk_warning`
- `worker_warning`
- `queue_stuck`
