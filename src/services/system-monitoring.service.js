const os = require("os");
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

function boolValue(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function numberValue(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function bytesToHuman(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function secondsToHuman(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds || 0)));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function getBackupDirectory() {
  return process.env.DB_BACKUP_DIR || process.env.BACKUP_DIR || path.resolve(process.cwd(), "..", "backup");
}

function isBackupFile(fileName) {
  return /\.(sql|sql\.gz|dump|dump\.gz|backup|bak|zip)$/i.test(fileName);
}

async function checkDbHealth() {
  const started = Date.now();
  try {
    const [rows] = await pool.query("SELECT DATABASE() AS database_name, VERSION() AS version, NOW() AS server_time");
    return {
      ok: true,
      latency_ms: Date.now() - started,
      database_name: rows?.[0]?.database_name || process.env.DB_NAME || null,
      version: rows?.[0]?.version || null,
      server_time: rows?.[0]?.server_time || null
    };
  } catch (error) {
    return {
      ok: false,
      latency_ms: Date.now() - started,
      error: error.message
    };
  }
}

async function getQueueStats() {
  const defaults = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
  try {
    const [rows] = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM ai_summary_queue
      GROUP BY status
    `);
    const stats = { ...defaults };
    for (const row of rows || []) {
      const key = String(row.status || "unknown").toLowerCase();
      stats[key] = Number(row.count || 0);
      stats.total += Number(row.count || 0);
    }
    return { ok: true, ...stats };
  } catch (error) {
    return { ok: false, ...defaults, error: error.message };
  }
}

async function getMemoryStats() {
  const result = {
    ok: true,
    ai_memory_count: 0,
    recent_buffer_count: 0,
    conversation_logs_count: 0,
    project_assets_count: 0,
    last_memory_time: null,
    last_conversation_time: null,
    errors: []
  };

  const queries = [
    ["ai_memory_count", "SELECT COUNT(*) AS count, MAX(created_at) AS last_time FROM ai_memory"],
    ["recent_buffer_count", "SELECT COUNT(*) AS count FROM ai_recent_buffer"],
    ["conversation_logs_count", "SELECT COUNT(*) AS count, MAX(created_at) AS last_time FROM ai_conversation_logs"],
    ["project_assets_count", "SELECT COUNT(*) AS count FROM project_assets"]
  ];

  for (const [key, sql] of queries) {
    try {
      const [rows] = await pool.query(sql);
      result[key] = Number(rows?.[0]?.count || 0);
      if (key === "ai_memory_count") result.last_memory_time = rows?.[0]?.last_time || null;
      if (key === "conversation_logs_count") result.last_conversation_time = rows?.[0]?.last_time || null;
    } catch (error) {
      result.ok = false;
      result.errors.push(`${key}: ${error.message}`);
    }
  }

  return result;
}

async function getOperationLogStats() {
  try {
    const [rows] = await pool.query(`
      SELECT log_level, COUNT(*) AS count
      FROM ai_operation_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY log_level
    `);
    const stats = { ok: true, error_24h: 0, warning_24h: 0, info_24h: 0, total_24h: 0 };
    for (const row of rows || []) {
      const level = String(row.log_level || "info").toUpperCase();
      const count = Number(row.count || 0);
      stats.total_24h += count;
      if (level === "ERROR") stats.error_24h += count;
      else if (level === "WARNING" || level === "WARN") stats.warning_24h += count;
      else stats.info_24h += count;
    }
    return stats;
  } catch (error) {
    return { ok: false, error_24h: 0, warning_24h: 0, info_24h: 0, total_24h: 0, error: error.message };
  }
}

async function getBackupSummary() {
  const backupDir = getBackupDirectory();
  const result = {
    ok: true,
    backup_dir: backupDir,
    directory_exists: false,
    directory_readable: false,
    directory_writable: false,
    backup_file_count: 0,
    latest_backup: null,
    history_success_count: 0,
    history_failed_count: 0,
    last_success_at: null,
    errors: []
  };

  try {
    result.directory_exists = fs.existsSync(backupDir);
    if (result.directory_exists) {
      try { fs.accessSync(backupDir, fs.constants.R_OK); result.directory_readable = true; } catch (_) {}
      try { fs.accessSync(backupDir, fs.constants.W_OK); result.directory_writable = true; } catch (_) {}
      const files = fs.readdirSync(backupDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && isBackupFile(entry.name))
        .map((entry) => {
          const fullPath = path.join(backupDir, entry.name);
          const stat = fs.statSync(fullPath);
          return {
            file_name: entry.name,
            file_path: fullPath,
            size_bytes: stat.size,
            size_human: bytesToHuman(stat.size),
            modified_at: stat.mtime.toISOString()
          };
        })
        .sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());
      result.backup_file_count = files.length;
      result.latest_backup = files[0] || null;
    }
  } catch (error) {
    result.ok = false;
    result.errors.push(`backup_dir: ${error.message}`);
  }

  try {
    const [rows] = await pool.query(`
      SELECT
        SUM(CASE WHEN backup_status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN backup_status = 'FAILED' THEN 1 ELSE 0 END) AS failed_count,
        MAX(CASE WHEN backup_status = 'SUCCESS' THEN created_at ELSE NULL END) AS last_success_at
      FROM ai_database_backup_history
    `);
    result.history_success_count = Number(rows?.[0]?.success_count || 0);
    result.history_failed_count = Number(rows?.[0]?.failed_count || 0);
    result.last_success_at = rows?.[0]?.last_success_at || null;
  } catch (error) {
    result.errors.push(`backup_history: ${error.message}`);
  }

  return result;
}

function getProcessStats() {
  const memoryUsage = process.memoryUsage();
  const loadAvg = os.loadavg ? os.loadavg() : [];
  return {
    node_env: process.env.NODE_ENV || "development",
    node_version: process.version,
    pid: process.pid,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    process_uptime_seconds: Math.floor(process.uptime()),
    process_uptime_human: secondsToHuman(process.uptime()),
    system_uptime_seconds: Math.floor(os.uptime()),
    system_uptime_human: secondsToHuman(os.uptime()),
    cpu_count: os.cpus()?.length || null,
    load_average: loadAvg,
    memory: {
      rss_bytes: memoryUsage.rss,
      rss_human: bytesToHuman(memoryUsage.rss),
      heap_used_bytes: memoryUsage.heapUsed,
      heap_used_human: bytesToHuman(memoryUsage.heapUsed),
      heap_total_bytes: memoryUsage.heapTotal,
      heap_total_human: bytesToHuman(memoryUsage.heapTotal),
      external_bytes: memoryUsage.external,
      external_human: bytesToHuman(memoryUsage.external)
    },
    system_memory: {
      total_bytes: os.totalmem(),
      total_human: bytesToHuman(os.totalmem()),
      free_bytes: os.freemem(),
      free_human: bytesToHuman(os.freemem()),
      free_percent: Number(((os.freemem() / os.totalmem()) * 100).toFixed(2))
    }
  };
}

function decideMonitoringStatus({ db, queue, memory, operationLogs, backup, processStats }) {
  const warnings = [];
  const errors = [];

  const queuePendingWarning = numberValue(process.env.MONITOR_QUEUE_PENDING_WARNING, 20);
  const queueFailedWarning = numberValue(process.env.MONITOR_QUEUE_FAILED_WARNING, 1);
  const dbLatencyWarning = numberValue(process.env.MONITOR_DB_LATENCY_WARNING_MS, 1000);
  const memoryFreeWarningPercent = numberValue(process.env.MONITOR_MEMORY_FREE_WARNING_PERCENT, 10);
  const operationErrorWarning = numberValue(process.env.MONITOR_OPERATION_ERROR_WARNING_24H, 1);

  if (!db.ok) errors.push(`DB health check failed: ${db.error || "unknown error"}`);
  if (db.ok && db.latency_ms > dbLatencyWarning) warnings.push(`DB latency is high: ${db.latency_ms}ms.`);

  if (!queue.ok) warnings.push(`Summary queue stats failed: ${queue.error || "unknown error"}`);
  if (queue.failed >= queueFailedWarning) warnings.push(`Failed summary queue count is ${queue.failed}.`);
  if (queue.pending >= queuePendingWarning) warnings.push(`Pending summary queue count is high: ${queue.pending}.`);

  if (!memory.ok) warnings.push(`Some memory stats failed: ${memory.errors.join("; ")}`);
  if (memory.ai_memory_count === 0) warnings.push("Long-term ai_memory count is 0.");

  if (operationLogs.ok && operationLogs.error_24h >= operationErrorWarning) {
    warnings.push(`Operation logs contain ${operationLogs.error_24h} ERROR event(s) in the last 24h.`);
  }

  if (!backup.directory_exists) warnings.push(`Backup directory does not exist: ${backup.backup_dir}`);
  else {
    if (!backup.directory_readable) errors.push("Backup directory is not readable.");
    if (!backup.directory_writable) warnings.push("Backup directory is not writable.");
    if (backup.backup_file_count === 0) warnings.push("No backup files found in backup directory.");
  }

  if (processStats.system_memory.free_percent < memoryFreeWarningPercent) {
    warnings.push(`System free memory is low: ${processStats.system_memory.free_percent}%.`);
  }

  let status = "GOOD";
  if (warnings.length > 0) status = "WARNING";
  if (errors.length > 0) status = "ERROR";

  return { status, warnings, errors };
}

async function getSystemMonitoringDashboard() {
  const checkedAt = new Date().toISOString();
  const [db, queue, memory, operationLogs, backup] = await Promise.all([
    checkDbHealth(),
    getQueueStats(),
    getMemoryStats(),
    getOperationLogStats(),
    getBackupSummary()
  ]);
  const processStats = getProcessStats();
  const decision = decideMonitoringStatus({ db, queue, memory, operationLogs, backup, processStats });

  return {
    ok: decision.status !== "ERROR",
    phase: "13-5",
    checked_at: checkedAt,
    monitoring_status: decision.status,
    db,
    queue,
    memory,
    operation_logs: operationLogs,
    backup,
    process: processStats,
    thresholds: {
      queue_pending_warning: numberValue(process.env.MONITOR_QUEUE_PENDING_WARNING, 20),
      queue_failed_warning: numberValue(process.env.MONITOR_QUEUE_FAILED_WARNING, 1),
      db_latency_warning_ms: numberValue(process.env.MONITOR_DB_LATENCY_WARNING_MS, 1000),
      memory_free_warning_percent: numberValue(process.env.MONITOR_MEMORY_FREE_WARNING_PERCENT, 10),
      operation_error_warning_24h: numberValue(process.env.MONITOR_OPERATION_ERROR_WARNING_24H, 1)
    },
    warnings: decision.warnings,
    errors: decision.errors,
    next_actions: buildMonitoringNextActions(decision)
  };
}

function buildMonitoringNextActions(decision) {
  const actions = [];
  if (decision.status === "GOOD") {
    actions.push("Proceed to Phase 13-6 Disk / DB / Queue / Worker detailed monitoring.");
  } else {
    actions.push("Review warnings/errors and run Backup Status, Summary Worker Status, and Operation Logs screens for detailed diagnosis.");
  }
  actions.push("Keep npm run dev and worker processes in separate Git Bash windows during local operation.");
  actions.push("For production, connect this dashboard to alert rules in Phase 13-7.");
  return actions;
}

function getSystemMonitoringChecklist() {
  return {
    ok: true,
    phase: "13-5",
    title: "System Monitoring Dashboard Checklist",
    checklist: [
      { key: "db_health", label: "DB connection, version, and latency are visible.", required: true },
      { key: "process_health", label: "Node.js process uptime, PID, memory usage, and system uptime are visible.", required: true },
      { key: "queue_health", label: "Summary queue pending/processing/completed/failed counts are visible.", required: true },
      { key: "memory_health", label: "ai_memory, recent buffer, conversation logs, and project assets counts are visible.", required: true },
      { key: "backup_health", label: "Backup directory and latest backup summary are visible.", required: true },
      { key: "operation_logs", label: "Recent operation log error/warning count is visible.", required: true },
      { key: "thresholds", label: "Warning thresholds are displayed and configurable through env variables.", required: true },
      { key: "next_phase", label: "Dashboard is ready for Phase 13-6 detailed disk/db/queue/worker monitoring.", required: true }
    ],
    recommended_env: {
      MONITOR_QUEUE_PENDING_WARNING: "Default 20",
      MONITOR_QUEUE_FAILED_WARNING: "Default 1",
      MONITOR_DB_LATENCY_WARNING_MS: "Default 1000",
      MONITOR_MEMORY_FREE_WARNING_PERCENT: "Default 10",
      MONITOR_OPERATION_ERROR_WARNING_24H: "Default 1"
    }
  };
}

async function runSystemMonitoringTest({ scenario = "current" } = {}) {
  if (scenario === "queue_warning") {
    const processStats = getProcessStats();
    const decision = decideMonitoringStatus({
      db: { ok: true, latency_ms: 10 },
      queue: { ok: true, pending: 999, failed: 0, processing: 0, completed: 0, total: 999 },
      memory: { ok: true, ai_memory_count: 1, errors: [] },
      operationLogs: { ok: true, error_24h: 0, warning_24h: 0 },
      backup: { directory_exists: true, directory_readable: true, directory_writable: true, backup_file_count: 1, backup_dir: getBackupDirectory() },
      processStats
    });
    return { ok: true, phase: "13-5", scenario, test_status: decision.status, warnings: decision.warnings, errors: decision.errors };
  }

  if (scenario === "db_error") {
    const processStats = getProcessStats();
    const decision = decideMonitoringStatus({
      db: { ok: false, error: "Simulated DB error" },
      queue: { ok: true, pending: 0, failed: 0, processing: 0, completed: 1, total: 1 },
      memory: { ok: true, ai_memory_count: 1, errors: [] },
      operationLogs: { ok: true, error_24h: 0, warning_24h: 0 },
      backup: { directory_exists: true, directory_readable: true, directory_writable: true, backup_file_count: 1, backup_dir: getBackupDirectory() },
      processStats
    });
    return { ok: true, phase: "13-5", scenario, test_status: decision.status, warnings: decision.warnings, errors: decision.errors };
  }

  const dashboard = await getSystemMonitoringDashboard();
  return {
    ok: true,
    phase: "13-5",
    scenario: "current",
    test_status: dashboard.monitoring_status,
    dashboard
  };
}

function getDriveRootForPath(targetPath) {
  const resolved = path.resolve(targetPath || process.cwd());
  if (/^[A-Za-z]:\\/.test(resolved)) return resolved.slice(0, 3);
  return path.parse(resolved).root || resolved;
}

function getDiskStatsForDirectory(directoryPath) {
  const result = {
    ok: true,
    directory: directoryPath,
    directory_exists: false,
    drive_root: getDriveRootForPath(directoryPath),
    total_bytes: null,
    free_bytes: null,
    available_bytes: null,
    used_bytes: null,
    used_percent: null,
    free_percent: null,
    total_human: null,
    free_human: null,
    used_human: null,
    statfs_supported: typeof fs.statfsSync === "function",
    error: null
  };

  try {
    result.directory_exists = fs.existsSync(directoryPath);
    const statTarget = result.directory_exists ? directoryPath : path.dirname(directoryPath);
    if (typeof fs.statfsSync === "function") {
      const stats = fs.statfsSync(statTarget);
      const blockSize = Number(stats.bsize || stats.frsize || 0);
      const total = Number(stats.blocks || 0) * blockSize;
      const free = Number(stats.bfree || 0) * blockSize;
      const available = Number(stats.bavail || stats.bfree || 0) * blockSize;
      const used = Math.max(0, total - free);
      result.total_bytes = total;
      result.free_bytes = free;
      result.available_bytes = available;
      result.used_bytes = used;
      result.used_percent = total > 0 ? Number(((used / total) * 100).toFixed(2)) : null;
      result.free_percent = total > 0 ? Number(((free / total) * 100).toFixed(2)) : null;
      result.total_human = bytesToHuman(total);
      result.free_human = bytesToHuman(free);
      result.used_human = bytesToHuman(used);
    }
  } catch (error) {
    result.ok = false;
    result.error = error.message;
  }

  return result;
}

async function getDbDetailedStats() {
  const dbName = process.env.DB_NAME || null;
  const started = Date.now();
  const result = {
    ok: true,
    database_name: dbName,
    latency_ms: null,
    version: null,
    table_count: 0,
    db_size_bytes: 0,
    db_size_human: "0 B",
    active_connections: null,
    max_connections: null,
    uptime_seconds: null,
    uptime_human: null,
    errors: []
  };

  try {
    const [basicRows] = await pool.query("SELECT DATABASE() AS database_name, VERSION() AS version");
    result.latency_ms = Date.now() - started;
    result.database_name = basicRows?.[0]?.database_name || dbName;
    result.version = basicRows?.[0]?.version || null;
  } catch (error) {
    result.ok = false;
    result.errors.push(`db_basic: ${error.message}`);
    result.latency_ms = Date.now() - started;
  }

  try {
    const [sizeRows] = await pool.query(`
      SELECT COUNT(*) AS table_count,
             COALESCE(SUM(data_length + index_length), 0) AS db_size_bytes
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `);
    result.table_count = Number(sizeRows?.[0]?.table_count || 0);
    result.db_size_bytes = Number(sizeRows?.[0]?.db_size_bytes || 0);
    result.db_size_human = bytesToHuman(result.db_size_bytes);
  } catch (error) {
    result.errors.push(`db_size: ${error.message}`);
  }

  try {
    const [statusRows] = await pool.query("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Uptime')");
    for (const row of statusRows || []) {
      if (row.Variable_name === "Threads_connected") result.active_connections = Number(row.Value || 0);
      if (row.Variable_name === "Uptime") {
        result.uptime_seconds = Number(row.Value || 0);
        result.uptime_human = secondsToHuman(result.uptime_seconds);
      }
    }
  } catch (error) {
    result.errors.push(`db_status: ${error.message}`);
  }

  try {
    const [maxRows] = await pool.query("SHOW VARIABLES LIKE 'max_connections'");
    result.max_connections = Number(maxRows?.[0]?.Value || 0) || null;
  } catch (error) {
    result.errors.push(`db_max_connections: ${error.message}`);
  }

  return result;
}

async function getQueueDetailedStats() {
  const stuckMinutes = numberValue(process.env.MONITOR_PROCESSING_STUCK_MINUTES, 30);
  const result = {
    ok: true,
    counts: { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 },
    oldest_pending: null,
    oldest_processing: null,
    stuck_processing_count: 0,
    latest_failed: null,
    thresholds: { processing_stuck_minutes: stuckMinutes },
    errors: []
  };

  try {
    const queueStats = await getQueueStats();
    result.counts = {
      pending: queueStats.pending || 0,
      processing: queueStats.processing || 0,
      completed: queueStats.completed || 0,
      failed: queueStats.failed || 0,
      total: queueStats.total || 0
    };
  } catch (error) {
    result.ok = false;
    result.errors.push(`queue_counts: ${error.message}`);
  }

  try {
    const [rows] = await pool.query(`
      SELECT
        MIN(CASE WHEN status = 'pending' THEN created_at ELSE NULL END) AS oldest_pending,
        MIN(CASE WHEN status = 'processing' THEN updated_at ELSE NULL END) AS oldest_processing,
        SUM(CASE WHEN status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE) THEN 1 ELSE 0 END) AS stuck_processing_count
      FROM ai_summary_queue
    `, [stuckMinutes]);
    result.oldest_pending = rows?.[0]?.oldest_pending || null;
    result.oldest_processing = rows?.[0]?.oldest_processing || null;
    result.stuck_processing_count = Number(rows?.[0]?.stuck_processing_count || 0);
  } catch (error) {
    result.errors.push(`queue_age: ${error.message}`);
  }

  try {
    const [failedRows] = await pool.query(`
      SELECT id, project_code, status, error_message, updated_at
      FROM ai_summary_queue
      WHERE status = 'failed'
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    result.latest_failed = failedRows?.[0] || null;
  } catch (error) {
    result.errors.push(`queue_latest_failed: ${error.message}`);
  }

  return result;
}

async function getWorkerDetailedStatus() {
  const result = {
    ok: true,
    workers: {
      api_server: {
        status: "RUNNING",
        pid: process.pid,
        uptime_seconds: Math.floor(process.uptime()),
        uptime_human: secondsToHuman(process.uptime()),
        command: "npm run dev"
      },
      summary_worker: {
        status: "MANUAL_CHECK_REQUIRED",
        command_once: "npm run worker:summary",
        command_loop: "npm run worker:summary:loop",
        evidence: null
      },
      daily_operation_worker: {
        status: "MANUAL_CHECK_REQUIRED",
        command: "npm run worker:daily-operation",
        evidence: null
      }
    },
    errors: []
  };

  try {
    const [summaryRows] = await pool.query(`
      SELECT
        MAX(CASE WHEN status = 'completed' THEN updated_at ELSE NULL END) AS last_completed_at,
        MAX(CASE WHEN status = 'processing' THEN updated_at ELSE NULL END) AS last_processing_at,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
      FROM ai_summary_queue
    `);
    const evidence = summaryRows?.[0] || {};
    result.workers.summary_worker.evidence = evidence;
    if (Number(evidence.processing_count || 0) > 0) {
      result.workers.summary_worker.status = "ACTIVE_OR_STUCK_PROCESSING";
    } else if (evidence.last_completed_at) {
      result.workers.summary_worker.status = "RECENT_COMPLETION_EVIDENCE";
    } else if (Number(evidence.pending_count || 0) > 0) {
      result.workers.summary_worker.status = "PENDING_QUEUE_EXISTS";
    }
  } catch (error) {
    result.errors.push(`summary_worker_evidence: ${error.message}`);
  }

  try {
    const [columns] = await pool.query(`SHOW COLUMNS FROM ai_daily_operation_automation_runs`);
    const columnNames = (columns || []).map((col) => col.Field);
    const selectColumns = ["id", "run_type", "overall_status", "created_at"];

    if (columnNames.includes("status")) {
      selectColumns.splice(2, 0, "status");
    }
    if (columnNames.includes("run_status") && !selectColumns.includes("run_status")) {
      selectColumns.splice(2, 0, "run_status");
    }
    if (columnNames.includes("completed_at")) {
      selectColumns.push("completed_at");
    }

    const [dailyRows] = await pool.query(`
      SELECT ${selectColumns.join(", ")}
      FROM ai_daily_operation_automation_runs
      ORDER BY id DESC
      LIMIT 1
    `);
    result.workers.daily_operation_worker.evidence = dailyRows?.[0] || null;
    if (dailyRows?.[0]) result.workers.daily_operation_worker.status = "LATEST_RUN_RECORDED";
  } catch (error) {
    // Daily worker evidence should not make the whole monitoring screen fail.
    // It is a manual-check signal when the automation-run table shape differs by phase.
    result.workers.daily_operation_worker.status = "MANUAL_CHECK_REQUIRED";
    result.workers.daily_operation_worker.evidence = null;
    result.errors.push(`daily_worker_evidence: ${error.message}`);
  }

  return result;
}

function decideDetailedMonitoringStatus({ disk, db, queue, worker }) {
  const warnings = [];
  const errors = [];
  const diskFreeWarning = numberValue(process.env.MONITOR_DISK_FREE_WARNING_PERCENT, 15);
  const dbLatencyWarning = numberValue(process.env.MONITOR_DB_LATENCY_WARNING_MS, 1000);
  const failedWarning = numberValue(process.env.MONITOR_QUEUE_FAILED_WARNING, 1);

  if (!disk.ok) errors.push(`Disk check failed: ${disk.error}`);
  if (disk.free_percent !== null && disk.free_percent < diskFreeWarning) warnings.push(`Disk free space is low: ${disk.free_percent}%`);
  if (!db.ok) errors.push(`DB detailed check failed: ${db.errors.join('; ')}`);
  if (db.latency_ms !== null && db.latency_ms >= dbLatencyWarning) warnings.push(`DB latency is high: ${db.latency_ms} ms`);
  if ((queue.counts?.failed || 0) >= failedWarning) warnings.push(`Failed summary queue exists: ${queue.counts.failed}`);
  if ((queue.stuck_processing_count || 0) > 0) warnings.push(`Stuck processing queue exists: ${queue.stuck_processing_count}`);
  if (worker.errors?.length) warnings.push(`Worker evidence has warnings: ${worker.errors.join('; ')}`);

  let status = "GOOD";
  if (warnings.length > 0) status = "WARNING";
  if (errors.length > 0) status = "ERROR";
  return { status, warnings, errors };
}

async function getDetailedResourceMonitoring() {
  const backupDir = getBackupDirectory();
  const [db, queue, worker] = await Promise.all([
    getDbDetailedStats(),
    getQueueDetailedStats(),
    getWorkerDetailedStatus()
  ]);
  const disk = getDiskStatsForDirectory(backupDir);
  const decision = decideDetailedMonitoringStatus({ disk, db, queue, worker });

  return {
    ok: decision.status !== "ERROR",
    phase: "13-6",
    checked_at: new Date().toISOString(),
    monitoring_status: decision.status,
    disk,
    db,
    queue,
    worker,
    thresholds: {
      monitor_disk_free_warning_percent: numberValue(process.env.MONITOR_DISK_FREE_WARNING_PERCENT, 15),
      monitor_processing_stuck_minutes: numberValue(process.env.MONITOR_PROCESSING_STUCK_MINUTES, 30),
      monitor_db_latency_warning_ms: numberValue(process.env.MONITOR_DB_LATENCY_WARNING_MS, 1000),
      monitor_queue_failed_warning: numberValue(process.env.MONITOR_QUEUE_FAILED_WARNING, 1)
    },
    warnings: decision.warnings,
    errors: decision.errors,
    next_actions: [
      "Keep API server and workers in separate terminal windows during local operation.",
      "If summary_worker status is PENDING_QUEUE_EXISTS, run npm run worker:summary or use Summary Worker → Process Batch.",
      "If disk free space is low, move old backup files to external storage before running new backups.",
      "Phase 13-7 will connect these metrics to alert rules."
    ]
  };
}

async function getWorkerMonitoringStatus() {
  const worker = await getWorkerDetailedStatus();
  return {
    ok: true,
    phase: "13-6",
    checked_at: new Date().toISOString(),
    worker,
    recommended_commands: [
      { name: "API Server", command: "npm run dev" },
      { name: "Summary Worker Once", command: "npm run worker:summary" },
      { name: "Summary Worker Loop", command: "npm run worker:summary:loop" },
      { name: "Daily Operation Worker", command: "npm run worker:daily-operation" }
    ]
  };
}

function getResourceMonitoringChecklist() {
  return {
    ok: true,
    phase: "13-6",
    title: "Disk / DB / Queue / Worker Monitoring Checklist",
    checklist: [
      { key: "disk", label: "Disk usage and backup drive free space are visible.", required: true },
      { key: "db", label: "DB latency, size, table count, connection and uptime are visible.", required: true },
      { key: "queue", label: "Summary Queue counts, oldest pending, stuck processing, and latest failed item are visible.", required: true },
      { key: "worker", label: "API server, summary worker, and daily operation worker evidence are visible.", required: true },
      { key: "thresholds", label: "Thresholds are configurable from environment variables.", required: true },
      { key: "next_phase", label: "Metrics are ready for Phase 13-7 alert rule preparation.", required: true }
    ],
    recommended_env: {
      MONITOR_DISK_FREE_WARNING_PERCENT: "Default 15",
      MONITOR_PROCESSING_STUCK_MINUTES: "Default 30",
      MONITOR_DB_LATENCY_WARNING_MS: "Default 1000",
      MONITOR_QUEUE_FAILED_WARNING: "Default 1"
    }
  };
}

async function runDetailedMonitoringTest({ scenario = "current" } = {}) {
  if (scenario === "disk_warning") {
    const detailed = await getDetailedResourceMonitoring();
    detailed.monitoring_status = "WARNING";
    detailed.warnings = [...(detailed.warnings || []), "Simulated disk warning: free space below threshold."];
    return { ok: true, phase: "13-6", scenario, test_status: "WARNING", detailed };
  }
  if (scenario === "worker_warning") {
    const detailed = await getDetailedResourceMonitoring();
    detailed.monitoring_status = "WARNING";
    detailed.warnings = [...(detailed.warnings || []), "Simulated worker warning: summary worker evidence missing."];
    return { ok: true, phase: "13-6", scenario, test_status: "WARNING", detailed };
  }
  if (scenario === "queue_stuck") {
    const detailed = await getDetailedResourceMonitoring();
    detailed.monitoring_status = "WARNING";
    detailed.queue.stuck_processing_count = Math.max(1, detailed.queue.stuck_processing_count || 0);
    detailed.warnings = [...(detailed.warnings || []), "Simulated stuck processing queue."];
    return { ok: true, phase: "13-6", scenario, test_status: "WARNING", detailed };
  }

  const detailed = await getDetailedResourceMonitoring();
  return { ok: true, phase: "13-6", scenario: "current", test_status: detailed.monitoring_status, detailed };
}


// ======================================================
// Phase 13-7: Alert Rules Preparation
// ======================================================
function getAlertRuleDefinitions() {
  return [
    {
      rule_key: "db_connection_error",
      category: "database",
      severity: "critical",
      enabled: boolValue(process.env.ALERT_DB_CONNECTION_ERROR_ENABLED, true),
      condition: "DB health check fails",
      threshold_env: null,
      default_threshold: null,
      operator_action: "Check DB server, DB credentials, network path, and restart API server after DB is available."
    },
    {
      rule_key: "db_latency_high",
      category: "database",
      severity: "warning",
      enabled: boolValue(process.env.ALERT_DB_LATENCY_ENABLED, true),
      condition: "DB latency is greater than or equal to threshold",
      threshold_env: "ALERT_DB_LATENCY_MS",
      default_threshold: numberValue(process.env.ALERT_DB_LATENCY_MS, 1000),
      operator_action: "Check DB server load, NAS network latency, and slow queries."
    },
    {
      rule_key: "summary_queue_failed",
      category: "queue",
      severity: "warning",
      enabled: boolValue(process.env.ALERT_SUMMARY_QUEUE_FAILED_ENABLED, true),
      condition: "Failed summary queue count is greater than or equal to threshold",
      threshold_env: "ALERT_SUMMARY_QUEUE_FAILED_COUNT",
      default_threshold: numberValue(process.env.ALERT_SUMMARY_QUEUE_FAILED_COUNT, 1),
      operator_action: "Open Summary Queue, review failed items, then run Retry Failed or Retry Selected."
    },
    {
      rule_key: "summary_queue_pending_high",
      category: "queue",
      severity: "warning",
      enabled: boolValue(process.env.ALERT_SUMMARY_QUEUE_PENDING_ENABLED, true),
      condition: "Pending summary queue count is greater than or equal to threshold",
      threshold_env: "ALERT_SUMMARY_QUEUE_PENDING_COUNT",
      default_threshold: numberValue(process.env.ALERT_SUMMARY_QUEUE_PENDING_COUNT, 20),
      operator_action: "Run Summary Worker once or loop worker. Check worker terminal if pending count does not decrease."
    },
    {
      rule_key: "summary_queue_stuck_processing",
      category: "queue",
      severity: "warning",
      enabled: boolValue(process.env.ALERT_SUMMARY_QUEUE_STUCK_ENABLED, true),
      condition: "Processing queue older than threshold exists",
      threshold_env: "ALERT_STUCK_PROCESSING_COUNT",
      default_threshold: numberValue(process.env.ALERT_STUCK_PROCESSING_COUNT, 1),
      operator_action: "Use Summary Queue → Reset Stuck Processing after confirming worker is not actively processing."
    },
    {
      rule_key: "backup_missing",
      category: "backup",
      severity: "warning",
      enabled: boolValue(process.env.ALERT_BACKUP_MISSING_ENABLED, true),
      condition: "No backup file exists in backup directory",
      threshold_env: null,
      default_threshold: null,
      operator_action: "Run Manual DB Backup and verify Backup History."
    },
    {
      rule_key: "backup_too_old",
      category: "backup",
      severity: "warning",
      enabled: boolValue(process.env.ALERT_BACKUP_AGE_ENABLED, true),
      condition: "Latest backup file age is greater than threshold hours",
      threshold_env: "ALERT_BACKUP_MAX_AGE_HOURS",
      default_threshold: numberValue(process.env.ALERT_BACKUP_MAX_AGE_HOURS, 24),
      operator_action: "Run Manual DB Backup or verify automatic backup process."
    },
    {
      rule_key: "backup_directory_not_writable",
      category: "backup",
      severity: "critical",
      enabled: boolValue(process.env.ALERT_BACKUP_DIR_WRITABLE_ENABLED, true),
      condition: "Backup directory is missing or not writable",
      threshold_env: null,
      default_threshold: null,
      operator_action: "Create backup directory and check Windows/NAS folder permissions."
    },
    {
      rule_key: "disk_free_low",
      category: "disk",
      severity: "warning",
      enabled: boolValue(process.env.ALERT_DISK_FREE_ENABLED, true),
      condition: "Disk free percentage is below threshold",
      threshold_env: "ALERT_DISK_FREE_MIN_PERCENT",
      default_threshold: numberValue(process.env.ALERT_DISK_FREE_MIN_PERCENT, 15),
      operator_action: "Move old backups to external storage or increase disk capacity."
    },
    {
      rule_key: "operation_errors_24h",
      category: "operation_logs",
      severity: "warning",
      enabled: boolValue(process.env.ALERT_OPERATION_ERRORS_ENABLED, true),
      condition: "Operation error count in last 24h is greater than or equal to threshold",
      threshold_env: "ALERT_OPERATION_ERRORS_24H",
      default_threshold: numberValue(process.env.ALERT_OPERATION_ERRORS_24H, 1),
      operator_action: "Open Operation Logs & Safety and review ERROR events."
    },
    {
      rule_key: "summary_worker_pending_without_completion",
      category: "worker",
      severity: "warning",
      enabled: boolValue(process.env.ALERT_SUMMARY_WORKER_EVIDENCE_ENABLED, true),
      condition: "Pending queue exists but summary worker has no recent completion evidence",
      threshold_env: null,
      default_threshold: null,
      operator_action: "Start npm run worker:summary:loop in a separate Git Bash window."
    }
  ];
}

function getBackupAgeHours(latestBackup) {
  if (!latestBackup?.modified_at) return null;
  const t = new Date(latestBackup.modified_at).getTime();
  if (!Number.isFinite(t)) return null;
  return Number(((Date.now() - t) / 3600000).toFixed(2));
}

function evaluateAlertRulesFromMetrics({ systemDashboard, detailedMonitoring }) {
  const rules = getAlertRuleDefinitions();
  const alerts = [];
  const suppressed = [];

  const addAlert = (ruleKey, actual_value, threshold_value, message, extra = {}) => {
    const rule = rules.find((r) => r.rule_key === ruleKey);
    if (!rule) return;
    const alert = {
      rule_key: rule.rule_key,
      category: rule.category,
      severity: rule.severity,
      enabled: rule.enabled,
      triggered: true,
      actual_value,
      threshold_value,
      message,
      operator_action: rule.operator_action,
      checked_at: new Date().toISOString(),
      ...extra
    };
    if (rule.enabled) alerts.push(alert);
    else suppressed.push({ ...alert, suppressed_reason: "rule_disabled" });
  };

  const db = detailedMonitoring?.db || systemDashboard?.db || {};
  const queue = detailedMonitoring?.queue || {};
  const queueCounts = queue.counts || systemDashboard?.queue || {};
  const backup = systemDashboard?.backup || {};
  const disk = detailedMonitoring?.disk || {};
  const opLogs = systemDashboard?.operation_logs || {};
  const worker = detailedMonitoring?.worker?.workers || {};

  if (db.ok === false) {
    addAlert("db_connection_error", "failed", "ok", `DB check failed: ${(db.errors || []).join('; ') || db.error || 'unknown error'}`);
  }

  const dbLatencyThreshold = numberValue(process.env.ALERT_DB_LATENCY_MS, 1000);
  if (db.latency_ms !== null && db.latency_ms !== undefined && db.latency_ms >= dbLatencyThreshold) {
    addAlert("db_latency_high", db.latency_ms, dbLatencyThreshold, `DB latency is high: ${db.latency_ms} ms.`);
  }

  const failedThreshold = numberValue(process.env.ALERT_SUMMARY_QUEUE_FAILED_COUNT, 1);
  if (Number(queueCounts.failed || 0) >= failedThreshold) {
    addAlert("summary_queue_failed", Number(queueCounts.failed || 0), failedThreshold, `Failed summary queue count is ${queueCounts.failed}.`);
  }

  const pendingThreshold = numberValue(process.env.ALERT_SUMMARY_QUEUE_PENDING_COUNT, 20);
  if (Number(queueCounts.pending || 0) >= pendingThreshold) {
    addAlert("summary_queue_pending_high", Number(queueCounts.pending || 0), pendingThreshold, `Pending summary queue count is high: ${queueCounts.pending}.`);
  }

  const stuckThreshold = numberValue(process.env.ALERT_STUCK_PROCESSING_COUNT, 1);
  if (Number(queue.stuck_processing_count || 0) >= stuckThreshold) {
    addAlert("summary_queue_stuck_processing", Number(queue.stuck_processing_count || 0), stuckThreshold, `Stuck processing queue count is ${queue.stuck_processing_count}.`);
  }

  if (!backup.directory_exists || !backup.directory_writable) {
    addAlert("backup_directory_not_writable", backup.directory_exists ? "not_writable" : "missing", "exists_and_writable", `Backup directory is not ready: ${backup.backup_dir || getBackupDirectory()}.`);
  }

  if (backup.directory_exists && Number(backup.backup_file_count || 0) === 0) {
    addAlert("backup_missing", 0, ">=1", "No backup files found in backup directory.");
  }

  const maxBackupAge = numberValue(process.env.ALERT_BACKUP_MAX_AGE_HOURS, 24);
  const latestBackup = backup.latest_backup || detailedMonitoring?.backup?.latest_backup || null;
  const backupAgeHours = getBackupAgeHours(latestBackup);
  if (backupAgeHours !== null && backupAgeHours >= maxBackupAge) {
    addAlert("backup_too_old", backupAgeHours, maxBackupAge, `Latest backup is ${backupAgeHours} hours old.`, { latest_backup: latestBackup });
  }

  const diskFreeMin = numberValue(process.env.ALERT_DISK_FREE_MIN_PERCENT, 15);
  if (disk.free_percent !== null && disk.free_percent !== undefined && Number(disk.free_percent) < diskFreeMin) {
    addAlert("disk_free_low", Number(disk.free_percent), diskFreeMin, `Disk free space is low: ${disk.free_percent}%.`);
  }

  const opErrorThreshold = numberValue(process.env.ALERT_OPERATION_ERRORS_24H, 1);
  if (Number(opLogs.error_24h || 0) >= opErrorThreshold) {
    addAlert("operation_errors_24h", Number(opLogs.error_24h || 0), opErrorThreshold, `Operation logs contain ${opLogs.error_24h} ERROR event(s) in the last 24h.`);
  }

  const summaryWorker = worker.summary_worker || {};
  const pendingCount = Number(queueCounts.pending || 0);
  if (pendingCount > 0 && ["PENDING_QUEUE_EXISTS", "MANUAL_CHECK_REQUIRED"].includes(summaryWorker.status)) {
    addAlert("summary_worker_pending_without_completion", summaryWorker.status || "unknown", "RECENT_COMPLETION_EVIDENCE", `Pending queue exists (${pendingCount}) but summary worker may not be actively processing.`);
  }

  return {
    rules_total: rules.length,
    enabled_rules: rules.filter((r) => r.enabled).length,
    alert_count: alerts.length,
    critical_count: alerts.filter((a) => a.severity === "critical").length,
    warning_count: alerts.filter((a) => a.severity === "warning").length,
    alerts,
    suppressed
  };
}

function decideAlertStatus(evaluation) {
  if (evaluation.critical_count > 0) return "ERROR";
  if (evaluation.warning_count > 0) return "WARNING";
  return "GOOD";
}

async function getAlertRulesStatus() {
  const [systemDashboard, detailedMonitoring] = await Promise.all([
    getSystemMonitoringDashboard(),
    getDetailedResourceMonitoring()
  ]);
  const evaluation = evaluateAlertRulesFromMetrics({ systemDashboard, detailedMonitoring });
  const status = decideAlertStatus(evaluation);
  return {
    ok: status !== "ERROR",
    phase: "13-7",
    checked_at: new Date().toISOString(),
    alert_status: status,
    evaluation,
    data_sources: {
      system_monitoring_status: systemDashboard.monitoring_status,
      detailed_monitoring_status: detailedMonitoring.monitoring_status
    },
    warnings: evaluation.alerts.filter((a) => a.severity === "warning").map((a) => a.message),
    errors: evaluation.alerts.filter((a) => a.severity === "critical").map((a) => a.message),
    next_actions: evaluation.alerts.length
      ? evaluation.alerts.map((a) => ({ rule_key: a.rule_key, action: a.operator_action }))
      : [{ rule_key: "none", action: "No active alert. Continue normal monitoring." }]
  };
}

function getAlertRulesCatalog() {
  return {
    ok: true,
    phase: "13-7",
    title: "Alert Rules Catalog",
    rules: getAlertRuleDefinitions(),
    recommended_env: {
      ALERT_DB_LATENCY_MS: "Default 1000",
      ALERT_SUMMARY_QUEUE_FAILED_COUNT: "Default 1",
      ALERT_SUMMARY_QUEUE_PENDING_COUNT: "Default 20",
      ALERT_STUCK_PROCESSING_COUNT: "Default 1",
      ALERT_BACKUP_MAX_AGE_HOURS: "Default 24",
      ALERT_DISK_FREE_MIN_PERCENT: "Default 15",
      ALERT_OPERATION_ERRORS_24H: "Default 1"
    }
  };
}

function getAlertRulesChecklist() {
  return {
    ok: true,
    phase: "13-7",
    title: "Alert Rules Preparation Checklist",
    checklist: [
      { key: "rules_catalog", label: "Alert rules catalog is available for DB, queue, backup, disk, operation logs, and workers.", required: true },
      { key: "metrics_connected", label: "Alert evaluation uses System Monitoring and Resource Monitoring data.", required: true },
      { key: "thresholds_env", label: "Alert thresholds can be adjusted by environment variables.", required: true },
      { key: "operator_actions", label: "Each alert returns an operator action.", required: true },
      { key: "future_delivery", label: "Phase 14 or later can connect alert delivery to Telegram, email, or admin notification.", required: false }
    ]
  };
}

async function runAlertRulesTest({ scenario = "current" } = {}) {
  if (scenario === "queue_failed") {
    const systemDashboard = await getSystemMonitoringDashboard();
    const detailedMonitoring = await getDetailedResourceMonitoring();
    detailedMonitoring.queue.counts.failed = Math.max(1, Number(detailedMonitoring.queue.counts.failed || 0));
    const evaluation = evaluateAlertRulesFromMetrics({ systemDashboard, detailedMonitoring });
    return { ok: true, phase: "13-7", scenario, test_status: decideAlertStatus(evaluation), evaluation };
  }
  if (scenario === "backup_old") {
    const systemDashboard = await getSystemMonitoringDashboard();
    const detailedMonitoring = await getDetailedResourceMonitoring();
    systemDashboard.backup.latest_backup = {
      file_name: "simulated_old_backup.sql.gz",
      modified_at: new Date(Date.now() - 72 * 3600000).toISOString()
    };
    systemDashboard.backup.backup_file_count = Math.max(1, Number(systemDashboard.backup.backup_file_count || 0));
    const evaluation = evaluateAlertRulesFromMetrics({ systemDashboard, detailedMonitoring });
    return { ok: true, phase: "13-7", scenario, test_status: decideAlertStatus(evaluation), evaluation };
  }
  if (scenario === "disk_low") {
    const systemDashboard = await getSystemMonitoringDashboard();
    const detailedMonitoring = await getDetailedResourceMonitoring();
    detailedMonitoring.disk.free_percent = 1;
    const evaluation = evaluateAlertRulesFromMetrics({ systemDashboard, detailedMonitoring });
    return { ok: true, phase: "13-7", scenario, test_status: decideAlertStatus(evaluation), evaluation };
  }
  if (scenario === "db_error") {
    const systemDashboard = await getSystemMonitoringDashboard();
    const detailedMonitoring = await getDetailedResourceMonitoring();
    detailedMonitoring.db.ok = false;
    detailedMonitoring.db.errors = ["Simulated DB error"];
    const evaluation = evaluateAlertRulesFromMetrics({ systemDashboard, detailedMonitoring });
    return { ok: true, phase: "13-7", scenario, test_status: decideAlertStatus(evaluation), evaluation };
  }
  const status = await getAlertRulesStatus();
  return { ok: true, phase: "13-7", scenario: "current", test_status: status.alert_status, alert_status: status };
}

module.exports = {
  getSystemMonitoringDashboard,
  getSystemMonitoringChecklist,
  runSystemMonitoringTest,
  getDetailedResourceMonitoring,
  getWorkerMonitoringStatus,
  getResourceMonitoringChecklist,
  runDetailedMonitoringTest,
  getAlertRulesStatus,
  getAlertRulesCatalog,
  getAlertRulesChecklist,
  runAlertRulesTest
};
