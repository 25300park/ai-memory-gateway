const crypto = require("crypto");
const pool = require("../config/db");

// Phase 22-5: tracks the background-processing state of an upload-triggered import so the
// upload endpoint can respond immediately (job_id + status:'processing') instead of
// blocking until the whole ZIP is unzipped/parsed/inserted - the Next.js proxy route in
// front of this backend runs as a Vercel serverless function with a ~10s timeout, and a
// 33-conversation dedup check alone was already taking ~20s.
// mariadb driver returns BIGINT columns (e.g. raw_imported_conversations.id) as native
// BigInt, which JSON.stringify() cannot serialize on its own - app.js registers an Express
// "json replacer" that does this same BigInt->string conversion for res.json(), but that
// only applies to Express's own serialization path, not this direct JSON.stringify() call.
function safeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value, (key, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch (_) {
    return JSON.stringify({ serialization_error: true });
  }
}

async function ensureImportJobsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_jobs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL UNIQUE,
      platform VARCHAR(50) NOT NULL,
      project_code VARCHAR(120) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'processing',
      result_summary LONGTEXT NULL,
      error_message TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      INDEX idx_import_jobs_job_id (job_id),
      INDEX idx_import_jobs_status (status),
      INDEX idx_import_jobs_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function createImportJob({ platform, projectCode }) {
  await ensureImportJobsTable();
  const jobId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO import_jobs (job_id, platform, project_code, status) VALUES (?, ?, ?, 'processing')`,
    [jobId, platform, projectCode || null]
  );
  return jobId;
}

async function markImportJobCompleted(jobId, resultSummary) {
  await pool.query(
    `UPDATE import_jobs SET status = 'completed', result_summary = ?, completed_at = NOW() WHERE job_id = ?`,
    [safeJson(resultSummary), jobId]
  );
}

async function markImportJobFailed(jobId, errorMessage) {
  await pool.query(
    `UPDATE import_jobs SET status = 'failed', error_message = ?, completed_at = NOW() WHERE job_id = ?`,
    [String(errorMessage || "Unknown error").slice(0, 5000), jobId]
  );
}

async function getImportJobStatus(jobId) {
  await ensureImportJobsTable();
  const [rows] = await pool.query(`SELECT * FROM import_jobs WHERE job_id = ? LIMIT 1`, [jobId]);
  if (!rows.length) return null;

  const row = rows[0];
  let resultSummary = null;
  if (row.result_summary) {
    try {
      resultSummary = JSON.parse(row.result_summary);
    } catch (_) {
      resultSummary = null;
    }
  }

  return {
    job_id: row.job_id,
    platform: row.platform,
    project_code: row.project_code,
    status: row.status,
    result_summary: resultSummary,
    error_message: row.error_message,
    created_at: row.created_at,
    completed_at: row.completed_at
  };
}

module.exports = {
  ensureImportJobsTable,
  createImportJob,
  markImportJobCompleted,
  markImportJobFailed,
  getImportJobStatus
};
