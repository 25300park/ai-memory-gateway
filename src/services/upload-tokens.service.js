const crypto = require("crypto");
const pool = require("../config/db");

// Phase 22-8: short-lived, single-use tokens that let the browser upload a file directly to
// this backend without ever holding the full admin token (x-admin-token). The console's
// server-side /api/import/upload route (which DOES hold the real admin token, as a
// server-only env var) calls POST /ai/imports/upload-token to mint one of these, hands it to
// the browser, and the browser attaches it to the actual file upload instead. A leaked
// upload token only grants one file upload within 5 minutes - nothing like the blast radius
// of the full admin token (which reaches every admin endpoint, including code execution).
const UPLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;

async function ensureUploadTokensTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS upload_tokens (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      token VARCHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_upload_tokens_token (token),
      INDEX idx_upload_tokens_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function createUploadToken() {
  await ensureUploadTokensTable();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + UPLOAD_TOKEN_TTL_MS);
  await pool.query(`INSERT INTO upload_tokens (token, expires_at) VALUES (?, ?)`, [token, expiresAt]);
  return { token, expires_at: expiresAt.toISOString() };
}

// Single UPDATE with the not-used/not-expired conditions baked into the WHERE clause, so
// concurrent requests racing on the same token can only ever have one of them see
// affectedRows === 1 - that's what makes this single-use rather than just "checked, then
// used" (which would have a TOCTOU gap under concurrent requests).
async function consumeUploadToken(token) {
  if (!token || typeof token !== "string") return false;
  await ensureUploadTokensTable();
  const [result] = await pool.query(
    `UPDATE upload_tokens SET used_at = NOW() WHERE token = ? AND used_at IS NULL AND expires_at > NOW()`,
    [token]
  );
  return Number(result.affectedRows || 0) === 1;
}

module.exports = {
  ensureUploadTokensTable,
  createUploadToken,
  consumeUploadToken
};
