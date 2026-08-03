const crypto = require("crypto");
const pool = require("../config/db");

let adminSecurityEventsTableReady = false;

function truthy(value) {
  return String(value || "false").toLowerCase() === "true";
}

function getConfiguredAdminTokens() {
  const tokens = [];

  const primary = (process.env.ADMIN_TOKEN || "").trim();
  const secondary = (process.env.SECONDARY_ADMIN_TOKEN || process.env.ADMIN_TOKEN_NEXT || "").trim();

  if (primary) {
    tokens.push({ label: "primary", env_name: "ADMIN_TOKEN", value: primary });
  }

  if (secondary && secondary !== primary) {
    tokens.push({ label: "secondary", env_name: process.env.SECONDARY_ADMIN_TOKEN ? "SECONDARY_ADMIN_TOKEN" : "ADMIN_TOKEN_NEXT", value: secondary });
  }

  return tokens;
}

function maskToken(value) {
  const token = String(value || "");
  if (!token) return null;
  if (token.length <= 8) return `${token.slice(0, 2)}****${token.slice(-2)}`;
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

function tokenFingerprint(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function extractAdminToken(req, { allowQuery = true } = {}) {
  const headerValue = req.headers?.["x-admin-token"];

  if (typeof headerValue === "string" && headerValue.trim()) {
    return { value: headerValue.trim(), source: "header:x-admin-token" };
  }

  if (allowQuery) {
    const queryValue = req.query?.token;
    if (typeof queryValue === "string" && queryValue.trim()) {
      return { value: queryValue.trim(), source: "query:token" };
    }
  }

  return { value: "", source: "missing" };
}

function validateAdminToken(token) {
  const adminEnabled = truthy(process.env.ADMIN_ENABLED);

  if (!adminEnabled) {
    return {
      ok: true,
      admin_enabled: false,
      status: "ADMIN_AUTH_DISABLED",
      token_label: "disabled",
      message: "ADMIN_ENABLED is false. Admin token check is bypassed."
    };
  }

  const configuredTokens = getConfiguredAdminTokens();

  if (!configuredTokens.length) {
    return {
      ok: false,
      admin_enabled: true,
      status: "ADMIN_TOKEN_NOT_CONFIGURED",
      http_status: 500,
      message: "ADMIN_ENABLED=true but no ADMIN_TOKEN is configured."
    };
  }

  if (!token) {
    return {
      ok: false,
      admin_enabled: true,
      status: "ADMIN_TOKEN_MISSING",
      http_status: 401,
      message: "Admin token is required. Send x-admin-token header or /admin?token=..."
    };
  }

  const tokenBuffer = Buffer.from(token);
  const matched = configuredTokens.find((entry) => {
    const entryBuffer = Buffer.from(entry.value);
    return entryBuffer.length === tokenBuffer.length && crypto.timingSafeEqual(entryBuffer, tokenBuffer);
  });

  if (!matched) {
    return {
      ok: false,
      admin_enabled: true,
      status: "ADMIN_TOKEN_INVALID",
      http_status: 403,
      message: "Admin token is invalid.",
      provided_fingerprint: tokenFingerprint(token),
      provided_mask: maskToken(token)
    };
  }

  return {
    ok: true,
    admin_enabled: true,
    status: "ADMIN_TOKEN_ACCEPTED",
    token_label: matched.label,
    env_name: matched.env_name,
    token_fingerprint: tokenFingerprint(matched.value)
  };
}

async function ensureAdminSecurityEventsTable() {
  if (adminSecurityEventsTableReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_admin_security_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      event_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      event_type VARCHAR(60) NOT NULL,
      outcome VARCHAR(30) NOT NULL,
      reason VARCHAR(120) NULL,
      token_source VARCHAR(80) NULL,
      token_label VARCHAR(40) NULL,
      token_fingerprint VARCHAR(64) NULL,
      ip_address VARCHAR(80) NULL,
      method VARCHAR(20) NULL,
      path VARCHAR(500) NULL,
      user_agent VARCHAR(500) NULL,
      request_id VARCHAR(80) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_time (event_time),
      INDEX idx_outcome (outcome),
      INDEX idx_token_label (token_label)
    )
  `);

  adminSecurityEventsTableReady = true;
}

async function logAdminSecurityEvent({ req, event_type = "admin_api_auth", outcome, reason, token_source, token_label, token_fingerprint }) {
  try {
    await ensureAdminSecurityEventsTable();

    await pool.query(`
      INSERT INTO ai_admin_security_events
        (event_type, outcome, reason, token_source, token_label, token_fingerprint, ip_address, method, path, user_agent, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      event_type,
      outcome || "unknown",
      reason || null,
      token_source || null,
      token_label || null,
      token_fingerprint || null,
      req?.ip || req?.socket?.remoteAddress || null,
      req?.method || null,
      req?.originalUrl || req?.url || null,
      req?.headers?.["user-agent"] || null,
      req?.requestId || req?.headers?.["x-request-id"] || null
    ]);
  } catch (error) {
    console.error("[Admin Security Event Log Error]", error.message);
  }
}

function getAdminSecurityStatus() {
  const adminEnabled = truthy(process.env.ADMIN_ENABLED);
  const configuredTokens = getConfiguredAdminTokens();
  const primary = configuredTokens.find((entry) => entry.label === "primary");
  const secondary = configuredTokens.find((entry) => entry.label === "secondary");

  const warnings = [];
  const errors = [];

  if (adminEnabled && !primary) {
    errors.push("ADMIN_ENABLED=true but ADMIN_TOKEN is not configured.");
  }

  if (primary && primary.value.length < 16) {
    warnings.push("ADMIN_TOKEN appears short. Use a long random token in production.");
  }

  if (secondary && secondary.value.length < 16) {
    warnings.push("SECONDARY_ADMIN_TOKEN appears short. Use a long random token in production.");
  }

  if (!secondary) {
    warnings.push("SECONDARY_ADMIN_TOKEN is not configured. Token rotation is not ready yet.");
  }

  if (!adminEnabled) {
    warnings.push("ADMIN_ENABLED is false. Admin protection is currently bypassed.");
  }

  const rotationReady = Boolean(primary && secondary);

  return {
    ok: errors.length === 0,
    phase: "12-1",
    status: errors.length ? "ERROR" : warnings.length ? "WARNING" : "GOOD",
    admin_enabled: adminEnabled,
    primary_token_configured: Boolean(primary),
    secondary_token_configured: Boolean(secondary),
    token_count: configuredTokens.length,
    rotation_ready: rotationReady,
    accepted_token_labels: configuredTokens.map((entry) => entry.label),
    token_fingerprints: configuredTokens.map((entry) => ({
      label: entry.label,
      env_name: entry.env_name,
      mask: maskToken(entry.value),
      fingerprint: tokenFingerprint(entry.value)
    })),
    standard_responses: {
      missing_token: { http_status: 401, code: "ADMIN_TOKEN_MISSING" },
      invalid_token: { http_status: 403, code: "ADMIN_TOKEN_INVALID" },
      token_not_configured: { http_status: 500, code: "ADMIN_TOKEN_NOT_CONFIGURED" }
    },
    rotation_guide: [
      "Keep ADMIN_TOKEN unchanged.",
      "Add SECONDARY_ADMIN_TOKEN with the new token value.",
      "Restart the server and test Admin Console with the secondary token.",
      "After successful test, promote the new token to ADMIN_TOKEN and remove the old token.",
      "Restart the server again."
    ],
    warnings,
    errors
  };
}

async function getAdminSecurityEvents(limit = 50) {
  await ensureAdminSecurityEventsTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const [rows] = await pool.query(`
    SELECT *
    FROM ai_admin_security_events
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `);

  return {
    ok: true,
    count: rows.length,
    results: rows
  };
}

module.exports = {
  extractAdminToken,
  validateAdminToken,
  logAdminSecurityEvent,
  getAdminSecurityStatus,
  getAdminSecurityEvents,
  getConfiguredAdminTokens,
  tokenFingerprint,
  maskToken
};
