const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const zlib = require("zlib");
const pool = require("../config/db");

const BACKUP_PHASE = "13-2";
const HISTORY_FILE_NAME = "backup_history.jsonl";

function boolValue(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function getBackupDirectory() {
  return process.env.DB_BACKUP_DIR || process.env.BACKUP_DIR || path.resolve(process.cwd(), "..", "backup");
}

function getMysqlDumpBin() {
  return process.env.MYSQLDUMP_BIN || process.env.MYSQL_DUMP_BIN || "mysqldump";
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

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "_");
}

function sanitizeName(value, fallback = "database") {
  return String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || fallback;
}

function getBackupFileName(date = new Date()) {
  const dbName = sanitizeName(process.env.DB_NAME, "database");
  return `${dbName}_${safeTimestamp(date)}.sql.gz`;
}

function getBackupFilePath(date = new Date()) {
  const backupDir = getBackupDirectory();
  return path.join(backupDir, getBackupFileName(date));
}

function getHistoryFilePath() {
  return path.join(getBackupDirectory(), HISTORY_FILE_NAME);
}

function inspectDirectory({ createIfMissing = false } = {}) {
  const backupDir = getBackupDirectory();
  const result = {
    path: backupDir,
    exists: false,
    readable: false,
    writable: false,
    created: false,
    error: null
  };

  try {
    if (!fs.existsSync(backupDir) && createIfMissing) {
      fs.mkdirSync(backupDir, { recursive: true });
      result.created = true;
    }

    result.exists = fs.existsSync(backupDir);

    if (!result.exists) return result;

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

    return result;
  } catch (error) {
    result.error = error.message;
    return result;
  }
}

function getRequiredEnvStatus() {
  const keys = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  return keys.map((key) => ({
    key,
    configured: Boolean(process.env[key]),
    value: key === "DB_PASSWORD" ? (process.env[key] ? "configured" : null) : mask(process.env[key])
  }));
}

function getMissingRequiredEnv() {
  return getRequiredEnvStatus().filter((item) => !item.configured).map((item) => item.key);
}

async function checkDatabaseConnection() {
  const [rows] = await pool.query("SELECT DATABASE() AS database_name, NOW() AS server_time");
  return rows?.[0] || {};
}

async function getManualBackupPrecheck({ createDir = false } = {}) {
  const checkedAt = new Date().toISOString();
  const directory = inspectDirectory({ createIfMissing: createDir });
  const missingEnv = getMissingRequiredEnv();
  let db = null;
  let dbOk = false;
  let dbError = null;

  try {
    db = await checkDatabaseConnection();
    dbOk = Boolean(db?.database_name);
  } catch (error) {
    dbError = error.message;
  }

  const ready = dbOk && missingEnv.length === 0 && directory.exists && directory.writable;

  return {
    ok: ready,
    phase: BACKUP_PHASE,
    checked_at: checkedAt,
    ready,
    mysqldump_bin: getMysqlDumpBin(),
    backup_directory: directory,
    database: {
      ok: dbOk,
      host: mask(process.env.DB_HOST),
      port: process.env.DB_PORT || "3306",
      name: db?.database_name || process.env.DB_NAME || null,
      user: mask(process.env.DB_USER),
      server_time: db?.server_time || null,
      error: dbError
    },
    env: {
      required: getRequiredEnvStatus(),
      missing: missingEnv
    },
    dangerous_confirmation: {
      action_key: "MANUAL_DB_BACKUP",
      confirm_text: "MANUAL_DB_BACKUP"
    },
    warnings: buildPrecheckWarnings({ directory, missingEnv, dbOk, dbError })
  };
}

function buildPrecheckWarnings({ directory, missingEnv, dbOk, dbError }) {
  const warnings = [];
  if (missingEnv.length) warnings.push(`Missing required DB env values: ${missingEnv.join(", ")}`);
  if (!dbOk) warnings.push(`DB connection failed${dbError ? `: ${dbError}` : "."}`);
  if (!directory.exists) warnings.push(`Backup directory does not exist: ${directory.path}`);
  if (directory.exists && !directory.writable) warnings.push("Backup directory is not writable.");
  return warnings;
}

function buildMysqlDumpArgs() {
  const args = [
    `--host=${process.env.DB_HOST}`,
    `--port=${process.env.DB_PORT || 3306}`,
    `--user=${process.env.DB_USER}`,
    "--single-transaction",
    "--quick",
    "--routines",
    "--triggers",
    "--events",
    "--default-character-set=utf8mb4",
    process.env.DB_NAME
  ];

  if (boolValue(process.env.DB_BACKUP_ADD_DROP_TABLE, true)) {
    args.splice(args.length - 1, 0, "--add-drop-table");
  }

  return args;
}

function getMysqlDumpEnv() {
  return {
    ...process.env,
    MYSQL_PWD: process.env.DB_PASSWORD || ""
  };
}

function appendHistory(record) {
  const dir = getBackupDirectory();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(getHistoryFilePath(), `${JSON.stringify(record)}\n`, "utf8");
}

function readBackupHistory(limit = 30) {
  const filePath = getHistoryFilePath();
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);

  if (!fs.existsSync(filePath)) {
    return {
      ok: true,
      phase: BACKUP_PHASE,
      count: 0,
      history_file: filePath,
      results: []
    };
  }

  const lines = fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const results = [];
  for (const line of lines.slice(-safeLimit).reverse()) {
    try {
      results.push(JSON.parse(line));
    } catch (_) {
      results.push({ ok: false, status: "PARSE_FAILED", raw: line.slice(0, 300) });
    }
  }

  return {
    ok: true,
    phase: BACKUP_PHASE,
    count: results.length,
    history_file: filePath,
    results
  };
}

function runMysqlDumpToGzip({ outputPath }) {
  return new Promise((resolve, reject) => {
    const command = getMysqlDumpBin();
    const args = buildMysqlDumpArgs();
    const gzip = zlib.createGzip({ level: 9 });
    const output = fs.createWriteStream(outputPath, { flags: "wx" });
    const child = spawn(command, args, {
      env: getMysqlDumpEnv(),
      windowsHide: true
    });

    let stderr = "";
    let settled = false;
    let childClosed = false;
    let outputFinished = false;
    let exitCode = null;

    function removePartialFile() {
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (_) {}
    }

    function failOnce(error) {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (_) {}
      try { output.destroy(); } catch (_) {}
      try { gzip.destroy(); } catch (_) {}
      removePartialFile();
      reject(error);
    }

    function maybeFinish() {
      if (settled || !childClosed || !outputFinished) return;

      if (exitCode !== 0) {
        return failOnce(new Error(`mysqldump exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`));
      }

      settled = true;
      resolve({ stderr: stderr.trim() || null });
    }

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    child.on("error", (error) => {
      failOnce(new Error(`mysqldump could not start: ${error.message}`));
    });

    gzip.on("error", failOnce);
    output.on("error", failOnce);

    child.stdout.pipe(gzip).pipe(output);

    child.on("close", (code) => {
      childClosed = true;
      exitCode = code;
      maybeFinish();
    });

    output.on("finish", () => {
      outputFinished = true;
      maybeFinish();
    });
  });
}

async function runManualDatabaseBackup({ actor = null, requestId = null } = {}) {
  const startedAt = new Date();
  const precheck = await getManualBackupPrecheck({ createDir: true });
  const outputPath = getBackupFilePath(startedAt);
  const fileName = path.basename(outputPath);

  const baseRecord = {
    phase: BACKUP_PHASE,
    action: "MANUAL_DB_BACKUP",
    started_at: startedAt.toISOString(),
    request_id: requestId || null,
    actor_role: actor?.role || null,
    token_label: actor?.token_label || null,
    database_name: process.env.DB_NAME || null,
    backup_directory: getBackupDirectory(),
    file_name: fileName
  };

  if (!precheck.ready) {
    const failedRecord = {
      ...baseRecord,
      ok: false,
      status: "PRECHECK_FAILED",
      finished_at: new Date().toISOString(),
      error: "Manual backup precheck failed.",
      warnings: precheck.warnings
    };
    appendHistory(failedRecord);
    return {
      ok: false,
      phase: BACKUP_PHASE,
      status: "PRECHECK_FAILED",
      precheck,
      history_record: failedRecord
    };
  }

  try {
    const dumpResult = await runMysqlDumpToGzip({ outputPath });
    const stat = fs.statSync(outputPath);
    const finishedAt = new Date();
    const record = {
      ...baseRecord,
      ok: true,
      status: "SUCCESS",
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      file_path: outputPath,
      file_size_bytes: stat.size,
      file_size_human: bytesToHuman(stat.size),
      mysqldump_warning: dumpResult.stderr || null
    };

    appendHistory(record);

    return {
      ok: true,
      phase: BACKUP_PHASE,
      status: "SUCCESS",
      message: "Manual database backup completed.",
      backup: record,
      precheck
    };
  } catch (error) {
    const failedRecord = {
      ...baseRecord,
      ok: false,
      status: "FAILED",
      finished_at: new Date().toISOString(),
      error: error.message
    };
    appendHistory(failedRecord);

    return {
      ok: false,
      phase: BACKUP_PHASE,
      status: "FAILED",
      message: error.message,
      backup: failedRecord,
      precheck
    };
  }
}

module.exports = {
  getBackupDirectory,
  getManualBackupPrecheck,
  readBackupHistory,
  runManualDatabaseBackup
};
