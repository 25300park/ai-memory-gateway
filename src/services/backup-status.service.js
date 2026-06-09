const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const zlib = require("zlib");
const pool = require("../config/db");

function boolValue(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function numberValue(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function getBackupDirectory() {
  return process.env.DB_BACKUP_DIR || process.env.BACKUP_DIR || path.resolve(process.cwd(), "..", "backup");
}

function mask(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 4) return "****";
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function bytesToHuman(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function isBackupFile(fileName) {
  return /\.(sql|sql\.gz|dump|dump\.gz|backup|bak|zip)$/i.test(fileName);
}

async function checkDbConnection() {
  const [rows] = await pool.query("SELECT DATABASE() AS database_name, VERSION() AS version, NOW() AS server_time");
  return rows?.[0] || {};
}

async function countTables() {
  const dbName = process.env.DB_NAME;
  if (!dbName) return null;
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS table_count
     FROM information_schema.tables
     WHERE table_schema = ?`,
    [dbName]
  );
  return Number(rows?.[0]?.table_count || 0);
}

async function countImportantRows() {
  const tables = [
    "ai_memory",
    "ai_recent_buffer",
    "ai_summary_queue",
    "ai_conversation_logs",
    "project_assets"
  ];

  const results = [];

  for (const table of tables) {
    try {
      const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM ${table}`);
      results.push({ table, ok: true, count: Number(rows?.[0]?.count || 0) });
    } catch (error) {
      results.push({ table, ok: false, count: null, error: error.message });
    }
  }

  return results;
}

function inspectBackupDirectory() {
  const backupDir = getBackupDirectory();
  const result = {
    configured_path: backupDir,
    exists: false,
    readable: false,
    writable: false,
    file_count: 0,
    backup_file_count: 0,
    total_size_bytes: 0,
    total_size_human: "0 B",
    latest_backup: null,
    recent_files: [],
    error: null
  };

  try {
    result.exists = fs.existsSync(backupDir);

    if (!result.exists) {
      return result;
    }

    try {
      fs.accessSync(backupDir, fs.constants.R_OK);
      result.readable = true;
    } catch (_) {
      result.readable = false;
    }

    try {
      fs.accessSync(backupDir, fs.constants.W_OK);
      result.writable = true;
    } catch (_) {
      result.writable = false;
    }

    const entries = fs.readdirSync(backupDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const fullPath = path.join(backupDir, entry.name);
        const stat = fs.statSync(fullPath);
        return {
          name: entry.name,
          size_bytes: stat.size,
          size_human: bytesToHuman(stat.size),
          modified_at: stat.mtime.toISOString(),
          is_backup_file: isBackupFile(entry.name)
        };
      })
      .sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    const backupFiles = files.filter((file) => file.is_backup_file);

    result.file_count = files.length;
    result.backup_file_count = backupFiles.length;
    result.total_size_bytes = files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
    result.total_size_human = bytesToHuman(result.total_size_bytes);
    result.latest_backup = backupFiles[0] || null;
    result.recent_files = files.slice(0, 10);

    return result;
  } catch (error) {
    result.error = error.message;
    return result;
  }
}

function getDiskInfo() {
  return {
    platform: process.platform,
    hostname: os.hostname(),
    total_memory_human: bytesToHuman(os.totalmem()),
    free_memory_human: bytesToHuman(os.freemem()),
    uptime_seconds: Math.floor(os.uptime())
  };
}

function decideStatus({ db, backupDir, tableCount, rowCounts }) {
  const warnings = [];
  const errors = [];

  if (!db?.database_name) {
    errors.push("DB connection check did not return a database name.");
  }

  if (!backupDir.exists) {
    warnings.push(`Backup directory does not exist: ${backupDir.configured_path}`);
  } else {
    if (!backupDir.readable) errors.push("Backup directory is not readable.");
    if (!backupDir.writable) warnings.push("Backup directory is not writable by the current process.");
    if (backupDir.backup_file_count === 0) warnings.push("No backup files were found in the backup directory.");
  }

  if (tableCount === 0) {
    warnings.push("No database tables were found for DB_NAME.");
  }

  const failedRowCounts = rowCounts.filter((item) => !item.ok);
  if (failedRowCounts.length > 0) {
    warnings.push(`Some important table counts failed: ${failedRowCounts.map((item) => item.table).join(", ")}`);
  }

  const backupRequired = boolValue(process.env.DB_BACKUP_REQUIRED, false);
  if (backupRequired && backupDir.backup_file_count === 0) {
    errors.push("DB_BACKUP_REQUIRED=true but no backup files were found.");
  }

  let status = "GOOD";
  if (warnings.length > 0) status = "WARNING";
  if (errors.length > 0) status = "ERROR";

  return { status, warnings, errors };
}

async function getDatabaseBackupStatus() {
  const checkedAt = new Date().toISOString();
  const db = await checkDbConnection();
  const tableCount = await countTables();
  const rowCounts = await countImportantRows();
  const backupDir = inspectBackupDirectory();
  const disk = getDiskInfo();
  const decision = decideStatus({ db, backupDir, tableCount, rowCounts });

  return {
    ok: decision.status !== "ERROR",
    phase: "13-1",
    checked_at: checkedAt,
    backup_status: decision.status,
    database: {
      host: mask(process.env.DB_HOST),
      port: process.env.DB_PORT || "3306",
      name: db.database_name || process.env.DB_NAME || null,
      user: mask(process.env.DB_USER),
      version: db.version || null,
      server_time: db.server_time || null,
      table_count: tableCount
    },
    important_table_counts: rowCounts,
    backup_directory: backupDir,
    system: disk,
    policy: {
      backup_required: boolValue(process.env.DB_BACKUP_REQUIRED, false),
      backup_dir_env: process.env.DB_BACKUP_DIR ? "DB_BACKUP_DIR" : process.env.BACKUP_DIR ? "BACKUP_DIR" : "default ../backup",
      manual_backup_enabled: true,
      manual_backup_endpoint: "POST /ai/backup/manual",
      manual_backup_note: "Phase 13-2 Manual DB Backup 실행 기능이 연결되었습니다."
    },
    warnings: decision.warnings,
    errors: decision.errors,
    next_actions: buildNextActions(decision, backupDir)
  };
}

function buildNextActions(decision, backupDir) {
  const actions = [];

  if (!backupDir.exists) {
    actions.push("Create the backup directory or set DB_BACKUP_DIR/BACKUP_DIR to an existing path.");
  }

  if (backupDir.exists && !backupDir.writable) {
    actions.push("Grant write permission to the Node.js process for the backup directory.");
  }

  if (backupDir.backup_file_count === 0) {
    actions.push("Run a manual DB backup in Phase 13-2 after the backup command is connected.");
  }

  if (decision.status === "GOOD") {
    actions.push("Proceed to Phase 13-2: Manual DB Backup execution.");
  }

  return actions;
}

function getDatabaseBackupChecklist() {
  return {
    ok: true,
    phase: "13-1",
    checklist: [
      { key: "db_connection", label: "DB connection can be checked from the backup module.", required: true },
      { key: "backup_directory", label: "Backup directory path is configured and visible.", required: true },
      { key: "backup_directory_access", label: "Backup directory is readable and preferably writable.", required: true },
      { key: "latest_backup_visible", label: "Latest backup file can be detected when present.", required: false },
      { key: "important_tables_counted", label: "Important AI Memory tables can be counted.", required: true },
      { key: "secret_safe", label: "DB password and tokens are never returned in backup status responses.", required: true },
      { key: "phase13_2_ready", label: "Manual DB Backup execution is available through POST /ai/backup/manual.", required: false },
      { key: "manual_backup_confirmation", label: "Manual backup requires confirmation text RUN_MANUAL_DB_BACKUP.", required: true },
      { key: "mysqldump_available", label: "mysqldump command should be available in PATH or MYSQLDUMP_PATH should be configured.", required: true }
    ],
    recommended_env: {
      DB_BACKUP_DIR: "Optional. Absolute backup directory path. Default: ../backup from api folder.",
      DB_BACKUP_REQUIRED: "Optional. true makes missing backup files an ERROR instead of WARNING."
    }
  };
}

async function runDatabaseBackupStatusTest({ scenario = "current" } = {}) {
  if (scenario === "missing_backup_dir") {
    const fakeDir = path.resolve(process.cwd(), "..", "backup_missing_test_directory");
    const backupDir = {
      configured_path: fakeDir,
      exists: false,
      readable: false,
      writable: false,
      backup_file_count: 0
    };
    const decision = decideStatus({ db: { database_name: "test" }, backupDir, tableCount: 1, rowCounts: [] });
    return {
      ok: true,
      phase: "13-1",
      scenario,
      test_status: decision.status,
      warnings: decision.warnings,
      errors: decision.errors
    };
  }

  if (scenario === "required_without_backup") {
    const backupDir = {
      configured_path: getBackupDirectory(),
      exists: true,
      readable: true,
      writable: true,
      backup_file_count: 0
    };
    const old = process.env.DB_BACKUP_REQUIRED;
    process.env.DB_BACKUP_REQUIRED = "true";
    const decision = decideStatus({ db: { database_name: "test" }, backupDir, tableCount: 1, rowCounts: [] });
    process.env.DB_BACKUP_REQUIRED = old;
    return {
      ok: decision.status !== "ERROR",
      phase: "13-1",
      scenario,
      test_status: decision.status,
      warnings: decision.warnings,
      errors: decision.errors
    };
  }

  const status = await getDatabaseBackupStatus();
  return {
    ok: true,
    phase: "13-1",
    scenario: "current",
    test_status: status.backup_status,
    status
  };
}



// ======================================================
// Phase 13-3: Backup History Storage
// ======================================================
function toMysqlDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (_) {
    return JSON.stringify({ serialization_error: true });
  }
}

function inferFileExtension(fileName = "") {
  const text = String(fileName || "").toLowerCase();
  if (text.endsWith(".sql.gz")) return "sql.gz";
  if (text.endsWith(".dump.gz")) return "dump.gz";
  const last = text.split(".").pop();
  return last && last !== text ? last : null;
}

async function ensureBackupHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_database_backup_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      backup_run_id VARCHAR(100) NULL,
      source VARCHAR(50) NOT NULL DEFAULT 'manual_backup',
      backup_status VARCHAR(50) NOT NULL,
      backup_mode VARCHAR(50) NULL,
      db_name VARCHAR(255) NULL,
      file_name VARCHAR(255) NULL,
      file_path TEXT NULL,
      file_extension VARCHAR(30) NULL,
      gzip TINYINT(1) NOT NULL DEFAULT 0,
      size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
      size_human VARCHAR(50) NULL,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      duration_ms BIGINT NULL,
      exit_code INT NULL,
      dry_run TINYINT(1) NOT NULL DEFAULT 0,
      command_preview TEXT NULL,
      error_code VARCHAR(100) NULL,
      error_message TEXT NULL,
      operator_action_json LONGTEXT NULL,
      raw_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_backup_status (backup_status),
      INDEX idx_backup_source (source),
      INDEX idx_completed_at (completed_at),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function insertBackupHistoryRecord(record) {
  await ensureBackupHistoryTable();
  const [result] = await pool.query(
    `INSERT INTO ai_database_backup_history
      (backup_run_id, source, backup_status, backup_mode, db_name, file_name, file_path,
       file_extension, gzip, size_bytes, size_human, started_at, completed_at, duration_ms,
       exit_code, dry_run, command_preview, error_code, error_message, operator_action_json, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.backup_run_id || null,
      record.source || "manual_backup",
      record.backup_status || "UNKNOWN",
      record.backup_mode || null,
      record.db_name || null,
      record.file_name || null,
      record.file_path || null,
      record.file_extension || inferFileExtension(record.file_name),
      record.gzip ? 1 : 0,
      Number(record.size_bytes || 0),
      record.size_human || bytesToHuman(record.size_bytes || 0),
      toMysqlDateTime(record.started_at),
      toMysqlDateTime(record.completed_at),
      record.duration_ms ?? null,
      record.exit_code ?? null,
      record.dry_run ? 1 : 0,
      record.command_preview || null,
      record.error_code || null,
      record.error_message || null,
      record.operator_action_json || null,
      record.raw_json || null
    ]
  );
  return result.insertId;
}

async function recordBackupHistoryFromResult(result, { source = "manual_backup" } = {}) {
  const output = result?.output_file || {};
  const runResult = result?.result || {};
  const status = result?.backup_status || (result?.ok === false ? "FAILED" : "UNKNOWN");
  const record = {
    backup_run_id: `${source}_${Date.now()}`,
    source,
    backup_status: status,
    backup_mode: result?.backup_mode || null,
    db_name: result?.database?.name || process.env.DB_NAME || null,
    file_name: output.name || null,
    file_path: output.path || null,
    file_extension: inferFileExtension(output.name),
    gzip: !!output.gzip,
    size_bytes: runResult.file_size_bytes || 0,
    size_human: runResult.file_size_human || bytesToHuman(runResult.file_size_bytes || 0),
    started_at: result?.started_at || null,
    completed_at: result?.completed_at || new Date().toISOString(),
    duration_ms: runResult.duration_ms ?? null,
    exit_code: result?.error?.exit_code ?? runResult.exit_code ?? null,
    dry_run: result?.backup_mode === "dry_run" || status === "DRY_RUN_READY",
    command_preview: result?.command_preview || null,
    error_code: result?.error?.code || null,
    error_message: result?.error?.message || (result?.ok === false ? result?.message : null),
    operator_action_json: safeJson(result?.operator_action || null),
    raw_json: safeJson(result)
  };

  return insertBackupHistoryRecord(record);
}

async function getBackupHistory({ limit = 50, status = "", source = "" } = {}) {
  await ensureBackupHistoryTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const where = [];
  const params = [];

  if (status) {
    where.push("backup_status = ?");
    params.push(status);
  }
  if (source) {
    where.push("source = ?");
    params.push(source);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT id, backup_run_id, source, backup_status, backup_mode, db_name, file_name, file_path,
            file_extension, gzip, size_bytes, size_human, started_at, completed_at, duration_ms,
            exit_code, dry_run, error_code, error_message, created_at, updated_at
     FROM ai_database_backup_history
     ${whereSql}
     ORDER BY id DESC
     LIMIT ${safeLimit}`,
    params
  );

  return {
    ok: true,
    phase: "13-3",
    count: rows.length,
    filters: { limit: safeLimit, status: status || null, source: source || null },
    results: rows
  };
}

async function getBackupHistoryStats({ days = 30 } = {}) {
  await ensureBackupHistoryTable();
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), 365);
  const [statusRows] = await pool.query(
    `SELECT backup_status, COUNT(*) AS count
     FROM ai_database_backup_history
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY backup_status
     ORDER BY count DESC`,
    [safeDays]
  );
  const [latestRows] = await pool.query(
    `SELECT id, backup_status, file_name, size_human, completed_at, created_at
     FROM ai_database_backup_history
     ORDER BY id DESC
     LIMIT 1`
  );
  const [successRows] = await pool.query(
    `SELECT id, file_name, size_human, completed_at, created_at
     FROM ai_database_backup_history
     WHERE backup_status IN ('SUCCESS', 'FILE_FOUND')
     ORDER BY id DESC
     LIMIT 1`
  );
  const [summaryRows] = await pool.query(
    `SELECT COUNT(*) AS total_count,
            SUM(CASE WHEN backup_status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_count,
            SUM(CASE WHEN backup_status = 'FAILED' THEN 1 ELSE 0 END) AS failed_count,
            SUM(CASE WHEN backup_status = 'DRY_RUN_READY' THEN 1 ELSE 0 END) AS dry_run_count,
            SUM(size_bytes) AS total_size_bytes
     FROM ai_database_backup_history`
  );

  const summary = summaryRows?.[0] || {};
  const failedCount = Number(summary.failed_count || 0);
  const successCount = Number(summary.success_count || 0);
  let status = "GOOD";
  const warnings = [];
  if (successCount === 0) {
    status = "WARNING";
    warnings.push("No successful backup history record has been stored yet.");
  }
  if (failedCount > 0) {
    warnings.push("Failed backup records exist. Review the history details.");
  }

  return {
    ok: true,
    phase: "13-3",
    history_status: status,
    days: safeDays,
    summary: {
      total_count: Number(summary.total_count || 0),
      success_count: successCount,
      failed_count: failedCount,
      dry_run_count: Number(summary.dry_run_count || 0),
      total_size_bytes: Number(summary.total_size_bytes || 0),
      total_size_human: bytesToHuman(summary.total_size_bytes || 0)
    },
    by_status: statusRows,
    latest_record: latestRows?.[0] || null,
    latest_success: successRows?.[0] || null,
    warnings
  };
}

async function syncBackupFilesToHistory({ limit = 100 } = {}) {
  await ensureBackupHistoryTable();
  const backupDir = inspectBackupDirectory();
  if (!backupDir.exists || !backupDir.readable) {
    return {
      ok: false,
      phase: "13-3",
      sync_status: "BACKUP_DIR_NOT_READABLE",
      backup_directory: backupDir
    };
  }

  const files = (backupDir.recent_files || []).filter((file) => file.is_backup_file).slice(0, Math.min(Number(limit) || 100, 200));
  let inserted_count = 0;
  let skipped_count = 0;
  const inserted = [];

  for (const file of files) {
    const filePath = path.join(backupDir.configured_path, file.name);
    const [existing] = await pool.query(
      `SELECT id FROM ai_database_backup_history WHERE file_path = ? LIMIT 1`,
      [filePath]
    );
    if (existing.length) {
      skipped_count += 1;
      continue;
    }

    const id = await insertBackupHistoryRecord({
      backup_run_id: `file_scan_${Date.now()}_${inserted_count}`,
      source: "file_scan",
      backup_status: "FILE_FOUND",
      backup_mode: "file_scan",
      db_name: process.env.DB_NAME || null,
      file_name: file.name,
      file_path: filePath,
      file_extension: inferFileExtension(file.name),
      gzip: String(file.name).toLowerCase().endsWith(".gz"),
      size_bytes: file.size_bytes || 0,
      size_human: file.size_human || bytesToHuman(file.size_bytes || 0),
      completed_at: file.modified_at,
      raw_json: safeJson({ file, backup_directory: backupDir.configured_path })
    });
    inserted_count += 1;
    inserted.push({ id, file_name: file.name });
  }

  return {
    ok: true,
    phase: "13-3",
    sync_status: "COMPLETED",
    scanned_count: files.length,
    inserted_count,
    skipped_count,
    inserted
  };
}

function getBackupHistoryChecklist() {
  return {
    ok: true,
    phase: "13-3",
    checklist: [
      { key: "history_table", label: "ai_database_backup_history table is created automatically.", required: true },
      { key: "manual_backup_record", label: "Manual backup success/failure/dry-run results are stored in history.", required: true },
      { key: "history_api", label: "GET /ai/backup/history returns recent backup records.", required: true },
      { key: "stats_api", label: "GET /ai/backup/history/stats returns backup success/failure summary.", required: true },
      { key: "file_sync", label: "Existing backup files can be synced into history.", required: false },
      { key: "admin_screen", label: "Backup History table is visible in Admin Console.", required: true }
    ],
    table: "ai_database_backup_history"
  };
}

async function runBackupHistoryTest({ scenario = "current" } = {}) {
  if (scenario === "insert_test_record") {
    const id = await insertBackupHistoryRecord({
      backup_run_id: `test_${Date.now()}`,
      source: "test",
      backup_status: "DRY_RUN_READY",
      backup_mode: "history_test",
      db_name: process.env.DB_NAME || "test_db",
      file_name: "history_test.sql.gz",
      file_path: path.join(getBackupDirectory(), "history_test.sql.gz"),
      file_extension: "sql.gz",
      gzip: true,
      size_bytes: 0,
      size_human: "0 B",
      dry_run: true,
      completed_at: new Date().toISOString(),
      raw_json: safeJson({ scenario })
    });
    return { ok: true, phase: "13-3", scenario, test_status: "TEST_RECORD_INSERTED", id };
  }

  const history = await getBackupHistory({ limit: 10 });
  const stats = await getBackupHistoryStats({ days: 30 });
  return {
    ok: true,
    phase: "13-3",
    scenario: "current",
    test_status: "HISTORY_READY",
    history_count: history.count,
    stats
  };
}

function sanitizeFilePart(value, fallback = "ai_memory_gateway") {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || fallback;
}

function timestampForFile() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function ensureBackupDirectory() {
  const backupDir = getBackupDirectory();
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  fs.accessSync(backupDir, fs.constants.R_OK | fs.constants.W_OK);
  return backupDir;
}

function getManualBackupCommandInfo({ gzip = true } = {}) {
  const dbName = process.env.DB_NAME;
  const backupDir = getBackupDirectory();
  const ts = timestampForFile();
  const safeDbName = sanitizeFilePart(dbName || "database");
  const extension = gzip ? "sql.gz" : "sql";
  const fileName = `${safeDbName}_${ts}.${extension}`;
  const outputPath = path.join(backupDir, fileName);
  const mysqldumpPath = process.env.MYSQLDUMP_PATH || "mysqldump";

  const args = [];
  if (process.env.DB_HOST) args.push("-h", process.env.DB_HOST);
  if (process.env.DB_PORT) args.push("-P", String(process.env.DB_PORT));
  if (process.env.DB_USER) args.push("-u", process.env.DB_USER);
  if (process.env.DB_PASSWORD) args.push(`-p${process.env.DB_PASSWORD}`);
  args.push("--single-transaction", "--quick", "--routines", "--events", "--triggers");
  if (dbName) args.push(dbName);

  return {
    backup_dir: backupDir,
    file_name: fileName,
    output_path: outputPath,
    mysqldump_path: mysqldumpPath,
    args,
    gzip,
    db_name: dbName || null,
    command_preview: `${mysqldumpPath} ${args.map((arg) => String(arg).startsWith("-p") ? "-p****" : arg).join(" ")}${gzip ? " | gzip" : ""} > ${outputPath}`
  };
}

function validateManualBackupRequest({ confirm_action, confirm_text, dry_run = false } = {}) {
  const required = "RUN_MANUAL_DB_BACKUP";
  const confirmationRequired = boolValue(process.env.DB_BACKUP_CONFIRMATION_REQUIRED, true);

  if (!dry_run && confirmationRequired && (confirm_action !== required || confirm_text !== required)) {
    const error = new Error("Manual DB backup requires confirmation text RUN_MANUAL_DB_BACKUP.");
    error.code = "MANUAL_BACKUP_CONFIRMATION_REQUIRED";
    error.statusCode = 409;
    error.required_confirmation = required;
    throw error;
  }

  if (!process.env.DB_NAME) {
    const error = new Error("DB_NAME is required for manual backup.");
    error.code = "DB_NAME_REQUIRED";
    error.statusCode = 400;
    throw error;
  }

  return { ok: true, required_confirmation: required };
}

function runMysqldumpToFile(commandInfo) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const dump = spawn(commandInfo.mysqldump_path, commandInfo.args, {
      windowsHide: true,
      shell: false
    });

    const fileStream = fs.createWriteStream(commandInfo.output_path);
    let stderr = "";
    let stdoutBytes = 0;

    dump.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    dump.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
    });

    let pipelineSource = dump.stdout;
    if (commandInfo.gzip) {
      const gzipStream = zlib.createGzip();
      pipelineSource = dump.stdout.pipe(gzipStream);
    }

    pipelineSource.pipe(fileStream);

    dump.on("error", (error) => {
      reject(error);
    });

    fileStream.on("error", (error) => {
      reject(error);
    });

    dump.on("close", (code) => {
      fileStream.on("close", () => {
        if (code !== 0) {
          const error = new Error(stderr || `mysqldump exited with code ${code}`);
          error.code = "MYSQLDUMP_FAILED";
          error.exitCode = code;
          return reject(error);
        }

        const stat = fs.existsSync(commandInfo.output_path) ? fs.statSync(commandInfo.output_path) : null;
        resolve({
          exit_code: code,
          stdout_bytes: stdoutBytes,
          file_size_bytes: stat?.size || 0,
          file_size_human: bytesToHuman(stat?.size || 0),
          duration_ms: Date.now() - startedAt,
          stderr: stderr.trim() || null
        });
      });
    });
  });
}

async function runManualDatabaseBackup(options = {}) {
  const startedAt = new Date().toISOString();
  const dryRun = boolValue(options.dry_run, false);
  const gzip = options.gzip === undefined ? boolValue(process.env.DB_BACKUP_GZIP, true) : boolValue(options.gzip, true);

  validateManualBackupRequest({
    confirm_action: options.confirm_action,
    confirm_text: options.confirm_text,
    dry_run: dryRun
  });

  const dbCheck = await checkDbConnection();
  const backupDir = ensureBackupDirectory();
  const commandInfo = getManualBackupCommandInfo({ gzip });

  const responseBase = {
    ok: true,
    phase: "13-2",
    backup_mode: dryRun ? "dry_run" : "manual_mysqldump",
    started_at: startedAt,
    database: {
      name: dbCheck.database_name || process.env.DB_NAME || null,
      host: mask(process.env.DB_HOST),
      port: process.env.DB_PORT || "3306",
      user: mask(process.env.DB_USER)
    },
    backup_directory: {
      path: backupDir,
      exists: fs.existsSync(backupDir),
      writable: true
    },
    output_file: {
      name: commandInfo.file_name,
      path: commandInfo.output_path,
      gzip
    },
    command_preview: commandInfo.command_preview,
    warning: null
  };

  if (dryRun) {
    const response = {
      ...responseBase,
      completed_at: new Date().toISOString(),
      backup_status: "DRY_RUN_READY",
      message: "Manual DB backup dry-run completed. No file was created."
    };
    try {
      response.backup_history_id = await recordBackupHistoryFromResult(response, { source: "manual_backup_dry_run" });
    } catch (historyError) {
      response.backup_history_error = historyError.message;
    }
    return response;
  }

  try {
    const result = await runMysqldumpToFile(commandInfo);
    const response = {
      ...responseBase,
      completed_at: new Date().toISOString(),
      backup_status: "SUCCESS",
      message: "Manual DB backup completed successfully.",
      result,
      latest_status: await getDatabaseBackupStatus()
    };
    try {
      response.backup_history_id = await recordBackupHistoryFromResult(response, { source: "manual_backup" });
    } catch (historyError) {
      response.backup_history_error = historyError.message;
    }
    return response;
  } catch (error) {
    if (fs.existsSync(commandInfo.output_path)) {
      try { fs.unlinkSync(commandInfo.output_path); } catch (_) {}
    }

    const response = {
      ...responseBase,
      ok: false,
      completed_at: new Date().toISOString(),
      backup_status: "FAILED",
      message: error.message,
      error: {
        code: error.code || "MANUAL_BACKUP_FAILED",
        message: error.message,
        exit_code: error.exitCode ?? null
      },
      operator_action: [
        "Check that mysqldump is installed and available in PATH.",
        "If mysqldump is installed elsewhere, set MYSQLDUMP_PATH in .env.",
        "Confirm DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME are correct.",
        "Confirm DB_BACKUP_DIR exists and is writable."
      ]
    };
    try {
      response.backup_history_id = await recordBackupHistoryFromResult(response, { source: "manual_backup" });
    } catch (historyError) {
      response.backup_history_error = historyError.message;
    }
    return response;
  }
}

function getManualDatabaseBackupChecklist() {
  return {
    ok: true,
    phase: "13-2",
    checklist: [
      { key: "backup_dir_writable", label: "Backup directory exists and is writable.", required: true },
      { key: "db_credentials", label: "DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME are configured.", required: true },
      { key: "mysqldump", label: "mysqldump is available in PATH or MYSQLDUMP_PATH is configured.", required: true },
      { key: "confirmation", label: "Manual backup requires RUN_MANUAL_DB_BACKUP confirmation.", required: true },
      { key: "gzip", label: "Backup can be stored as .sql.gz when DB_BACKUP_GZIP=true.", required: false },
      { key: "status_refresh", label: "After backup, DB Backup Status shows the newly created file.", required: true }
    ],
    recommended_env: {
      DB_BACKUP_DIR: "Absolute backup directory path. Default: ../backup from api folder.",
      MYSQLDUMP_PATH: "Optional absolute mysqldump path. Default: mysqldump from PATH.",
      DB_BACKUP_GZIP: "Optional. Default true.",
      DB_BACKUP_CONFIRMATION_REQUIRED: "Optional. Default true."
    },
    confirmation: {
      confirm_action: "RUN_MANUAL_DB_BACKUP",
      confirm_text: "RUN_MANUAL_DB_BACKUP"
    }
  };
}

async function runManualDatabaseBackupTest({ scenario = "dry_run" } = {}) {
  if (scenario === "missing_confirmation") {
    try {
      await runManualDatabaseBackup({ dry_run: false });
      return { ok: false, phase: "13-2", scenario, test_status: "UNEXPECTED_PASS" };
    } catch (error) {
      return {
        ok: true,
        phase: "13-2",
        scenario,
        test_status: error.code || "CONFIRMATION_BLOCKED",
        message: error.message
      };
    }
  }

  return runManualDatabaseBackup({ dry_run: true, confirm_action: "RUN_MANUAL_DB_BACKUP", confirm_text: "RUN_MANUAL_DB_BACKUP" });
}


// ======================================================
// Phase 13-4: Restore Readiness Checklist
// ======================================================
function getMysqlClientPath() {
  return process.env.MYSQL_CLIENT_PATH || process.env.MYSQL_PATH || "mysql";
}

async function getLatestRestorableBackup() {
  try {
    await ensureBackupHistoryTable();
    const [rows] = await pool.query(
      `SELECT id, backup_status, source, db_name, file_name, file_path, file_extension,
              gzip, size_bytes, size_human, completed_at, created_at
       FROM ai_database_backup_history
       WHERE backup_status IN ('SUCCESS', 'FILE_FOUND')
         AND file_path IS NOT NULL
       ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
       LIMIT 1`
    );

    if (rows && rows.length) {
      const row = rows[0];
      const exists = row.file_path ? fs.existsSync(row.file_path) : false;
      let readable = false;
      if (exists) {
        try {
          fs.accessSync(row.file_path, fs.constants.R_OK);
          readable = true;
        } catch (_) {
          readable = false;
        }
      }
      return {
        source: "history",
        history_id: row.id,
        backup_status: row.backup_status,
        db_name: row.db_name,
        file_name: row.file_name,
        file_path: row.file_path,
        file_extension: row.file_extension,
        gzip: !!row.gzip,
        size_bytes: Number(row.size_bytes || 0),
        size_human: row.size_human || bytesToHuman(row.size_bytes || 0),
        completed_at: row.completed_at || row.created_at,
        exists,
        readable
      };
    }
  } catch (error) {
    return {
      source: "history_error",
      error: error.message,
      exists: false,
      readable: false
    };
  }

  const backupDir = inspectBackupDirectory();
  const latest = backupDir.latest_backup;
  if (!latest) {
    return {
      source: "directory_scan",
      exists: false,
      readable: false,
      file_name: null,
      file_path: null
    };
  }

  const filePath = path.join(backupDir.configured_path, latest.name);
  let readable = false;
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    readable = true;
  } catch (_) {
    readable = false;
  }

  return {
    source: "directory_scan",
    history_id: null,
    backup_status: "FILE_FOUND",
    db_name: process.env.DB_NAME || null,
    file_name: latest.name,
    file_path: filePath,
    file_extension: inferFileExtension(latest.name),
    gzip: String(latest.name || "").toLowerCase().endsWith(".gz"),
    size_bytes: latest.size_bytes || 0,
    size_human: latest.size_human || bytesToHuman(latest.size_bytes || 0),
    completed_at: latest.modified_at,
    exists: fs.existsSync(filePath),
    readable
  };
}

function buildRestoreReadinessChecklistItems({ latestBackup, backupDir, historyStats }) {
  const hasLatest = !!latestBackup?.file_name;
  const latestReadable = !!latestBackup?.readable;
  const hasSuccessHistory = Number(historyStats?.summary?.success_count || 0) > 0 || latestBackup?.backup_status === "FILE_FOUND";

  return [
    {
      key: "db_connection_verified",
      group: "database",
      label: "Current DB connection is healthy before restore planning.",
      required: true,
      status: "CHECKED_BY_STATUS_API"
    },
    {
      key: "backup_directory_readable",
      group: "backup_file",
      label: "Backup directory exists and is readable.",
      required: true,
      status: backupDir.exists && backupDir.readable ? "PASS" : "FAIL"
    },
    {
      key: "latest_backup_available",
      group: "backup_file",
      label: "At least one latest backup file is available.",
      required: true,
      status: hasLatest ? "PASS" : "FAIL"
    },
    {
      key: "latest_backup_readable",
      group: "backup_file",
      label: "Latest backup file exists on disk and can be read by the Node process.",
      required: true,
      status: latestReadable ? "PASS" : "FAIL"
    },
    {
      key: "backup_history_has_success",
      group: "history",
      label: "Backup history contains a successful backup or a synced backup file.",
      required: true,
      status: hasSuccessHistory ? "PASS" : "WARNING"
    },
    {
      key: "restore_target_policy_defined",
      group: "restore_policy",
      label: "Restore target DB policy is defined before any actual restore. Production DB should not be overwritten directly.",
      required: true,
      status: process.env.DB_RESTORE_TARGET_DB ? "PASS" : "MANUAL_CHECK"
    },
    {
      key: "mysql_client_configured",
      group: "restore_tooling",
      label: "mysql client path is configured or available in PATH for future restore execution.",
      required: true,
      status: getMysqlClientPath() ? "CONFIGURED" : "MANUAL_CHECK"
    },
    {
      key: "dangerous_confirmation_required",
      group: "safety",
      label: "Future restore execution must require dangerous action confirmation.",
      required: true,
      status: "REQUIRED"
    },
    {
      key: "pre_restore_backup_required",
      group: "safety",
      label: "Before restore, create one fresh backup of the current DB state.",
      required: true,
      status: "MANUAL_CHECK"
    },
    {
      key: "restore_dry_run_first",
      group: "safety",
      label: "Restore should first be tested against a temporary/staging database, not the production database.",
      required: true,
      status: "MANUAL_CHECK"
    }
  ];
}

function decideRestoreReadiness({ latestBackup, backupDir, historyStats }) {
  const warnings = [];
  const errors = [];

  if (!backupDir.exists) errors.push("Backup directory does not exist.");
  if (backupDir.exists && !backupDir.readable) errors.push("Backup directory is not readable.");

  if (!latestBackup?.file_name) {
    errors.push("No restorable backup file was found.");
  } else {
    if (!latestBackup.exists) errors.push("Latest backup history record points to a file that does not exist on disk.");
    if (latestBackup.exists && !latestBackup.readable) errors.push("Latest backup file exists but is not readable.");
  }

  const successCount = Number(historyStats?.summary?.success_count || 0);
  const fileFound = latestBackup?.backup_status === "FILE_FOUND";
  if (successCount === 0 && !fileFound) {
    warnings.push("No successful manual backup history record exists yet. Run or sync backup history before restore planning.");
  }

  if (!process.env.DB_RESTORE_TARGET_DB) {
    warnings.push("DB_RESTORE_TARGET_DB is not configured. Actual restore execution should target a staging/temp DB first.");
  }

  if (!process.env.MYSQL_CLIENT_PATH && !process.env.MYSQL_PATH) {
    warnings.push("MYSQL_CLIENT_PATH/MYSQL_PATH is not configured. Future restore execution will rely on mysql being available in PATH.");
  }

  let status = "READY";
  if (warnings.length) status = "READY_WITH_MANUAL_CHECKS";
  if (errors.length) status = "NOT_READY";

  return { status, warnings, errors };
}

async function getRestoreReadinessStatus() {
  const checkedAt = new Date().toISOString();
  const db = await checkDbConnection();
  const backupDir = inspectBackupDirectory();
  let historyStats = null;
  try {
    historyStats = await getBackupHistoryStats({ days: 365 });
  } catch (error) {
    historyStats = {
      ok: false,
      history_status: "ERROR",
      error: error.message,
      summary: { success_count: 0, failed_count: 0, total_count: 0 }
    };
  }

  const latestBackup = await getLatestRestorableBackup();
  const decision = decideRestoreReadiness({ latestBackup, backupDir, historyStats });
  const checklist = buildRestoreReadinessChecklistItems({ latestBackup, backupDir, historyStats });

  return {
    ok: decision.status !== "NOT_READY",
    phase: "13-4",
    checked_at: checkedAt,
    restore_readiness_status: decision.status,
    database: {
      current_db: db.database_name || process.env.DB_NAME || null,
      host: mask(process.env.DB_HOST),
      port: process.env.DB_PORT || "3306",
      user: mask(process.env.DB_USER),
      server_time: db.server_time || null
    },
    restore_policy: {
      restore_execution_enabled: false,
      restore_execution_note: "Phase 13-4 only checks readiness. Actual restore execution should be added later with strict confirmation.",
      target_db: process.env.DB_RESTORE_TARGET_DB || null,
      mysql_client_path: getMysqlClientPath(),
      confirmation_required: true,
      required_confirmation_for_future_restore: "RUN_DB_RESTORE"
    },
    backup_directory: backupDir,
    latest_restorable_backup: latestBackup,
    history_summary: historyStats?.summary || null,
    checklist,
    warnings: decision.warnings,
    errors: decision.errors,
    next_actions: buildRestoreNextActions(decision, latestBackup)
  };
}

function buildRestoreNextActions(decision, latestBackup) {
  const actions = [];
  if (!latestBackup?.file_name) {
    actions.push("Run Phase 13-2 Manual DB Backup or sync existing backup files into backup history.");
  }
  if (latestBackup?.file_name && !latestBackup.readable) {
    actions.push("Confirm the latest backup file exists and is readable from the Node.js process.");
  }
  if (!process.env.DB_RESTORE_TARGET_DB) {
    actions.push("Prepare a staging restore target DB and set DB_RESTORE_TARGET_DB before implementing actual restore execution.");
  }
  actions.push("Before any real restore, run a fresh pre-restore backup of the current DB.");
  actions.push("Proceed to Phase 13-5 System Monitoring Dashboard after restore readiness is confirmed.");
  return actions;
}

function getRestoreReadinessChecklist() {
  return {
    ok: true,
    phase: "13-4",
    title: "Restore Readiness Checklist",
    purpose: "Confirm that backup files, history records, DB connection, and safety policy are ready before any restore execution feature is added.",
    checklist: [
      { key: "latest_backup_exists", label: "Latest backup file exists and is readable.", required: true },
      { key: "backup_history_ready", label: "ai_database_backup_history has successful or synced backup records.", required: true },
      { key: "staging_target_defined", label: "A staging/temp restore target DB is prepared; production overwrite is not allowed by default.", required: true },
      { key: "mysql_client_ready", label: "mysql client path is configured or available in PATH.", required: true },
      { key: "fresh_pre_restore_backup", label: "A fresh pre-restore backup will be created before restore execution.", required: true },
      { key: "dangerous_confirmation", label: "Actual restore execution must require RUN_DB_RESTORE confirmation and high-level permission.", required: true },
      { key: "manual_operator_review", label: "Operator reviews DB name, backup file, file size, and target DB before restore.", required: true }
    ],
    recommended_env: {
      DB_RESTORE_TARGET_DB: "Optional now. Recommended staging/temp DB name for future restore testing.",
      MYSQL_CLIENT_PATH: "Optional. Absolute mysql client path. Default: mysql from PATH.",
      DB_BACKUP_DIR: "Backup directory containing .sql or .sql.gz files."
    },
    safety_note: "Phase 13-4 does not execute restore. It only checks readiness. Actual restore execution should be implemented separately with strict confirmation."
  };
}

async function runRestoreReadinessTest({ scenario = "current" } = {}) {
  if (scenario === "no_backup") {
    const backupDir = {
      configured_path: getBackupDirectory(),
      exists: true,
      readable: true,
      writable: true,
      backup_file_count: 0
    };
    const latestBackup = { source: "test", file_name: null, exists: false, readable: false };
    const historyStats = { summary: { success_count: 0, failed_count: 0, total_count: 0 } };
    const decision = decideRestoreReadiness({ latestBackup, backupDir, historyStats });
    return {
      ok: true,
      phase: "13-4",
      scenario,
      test_status: decision.status,
      warnings: decision.warnings,
      errors: decision.errors
    };
  }

  if (scenario === "history_missing_file") {
    const backupDir = {
      configured_path: getBackupDirectory(),
      exists: true,
      readable: true,
      writable: true,
      backup_file_count: 1
    };
    const latestBackup = {
      source: "test",
      file_name: "missing_backup.sql.gz",
      file_path: path.join(getBackupDirectory(), "missing_backup.sql.gz"),
      exists: false,
      readable: false,
      backup_status: "SUCCESS"
    };
    const historyStats = { summary: { success_count: 1, failed_count: 0, total_count: 1 } };
    const decision = decideRestoreReadiness({ latestBackup, backupDir, historyStats });
    return {
      ok: true,
      phase: "13-4",
      scenario,
      test_status: decision.status,
      warnings: decision.warnings,
      errors: decision.errors,
      latest_restorable_backup: latestBackup
    };
  }

  const status = await getRestoreReadinessStatus();
  return {
    ok: true,
    phase: "13-4",
    scenario: "current",
    test_status: status.restore_readiness_status,
    status
  };
}

module.exports = {
  getDatabaseBackupStatus,
  getDatabaseBackupChecklist,
  runDatabaseBackupStatusTest,
  runManualDatabaseBackup,
  getManualDatabaseBackupChecklist,
  runManualDatabaseBackupTest,
  ensureBackupHistoryTable,
  getBackupHistory,
  getBackupHistoryStats,
  syncBackupFilesToHistory,
  getBackupHistoryChecklist,
  runBackupHistoryTest,
  getRestoreReadinessStatus,
  getRestoreReadinessChecklist,
  runRestoreReadinessTest
};
