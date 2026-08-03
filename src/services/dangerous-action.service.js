const pool = require("../config/db");
const {
  getAdminActorFromRequest,
  hasPermission,
  logAdminPermissionEvent
} = require("./admin-permission.service");
const { maskUrlToken } = require("../utils/mask-url.util");

let dangerousEventsTableReady = false;

function truthy(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function normalizeActionKey(value) {
  return String(value || "").trim().toUpperCase();
}

function splitCsv(value, fallback = []) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

const DANGEROUS_ACTIONS = {
  UNLOCK_AUTOMATION_LOCK: {
    group: "Automation",
    label: "Unlock daily automation lock",
    description: "Manually releases the daily operation automation lock. Use only when a stale lock blocks automation.",
    permission: "dangerous:execute",
    required_phrase: "UNLOCK_AUTOMATION_LOCK",
    route_hint: "POST /ai/system/daily-automation/unlock",
    risk_level: "high"
  },
  CLEANUP_OPERATION_LOGS: {
    group: "Operation Logs",
    label: "Cleanup old operation logs",
    description: "Deletes old operation logs according to the requested retention period.",
    permission: "dangerous:execute",
    required_phrase: "CLEANUP_OPERATION_LOGS",
    route_hint: "POST /ai/system/operation-logs/cleanup",
    risk_level: "medium"
  },
  DRAIN_SUMMARY_QUEUE: {
    group: "Summary Queue",
    label: "Drain pending summary queue",
    description: "Processes multiple pending summary queue batches. This can trigger many memory writes.",
    permission: "dangerous:execute",
    required_phrase: "DRAIN_SUMMARY_QUEUE",
    route_hint: "POST /ai/summary/drain",
    risk_level: "high"
  },
  RESET_STUCK_PROCESSING_QUEUE: {
    group: "Summary Queue",
    label: "Reset stuck processing queue",
    description: "Moves stale processing summary queue items back to pending.",
    permission: "summary:run",
    required_phrase: "RESET_STUCK_PROCESSING_QUEUE",
    route_hint: "POST /ai/summary/reset-stuck-processing",
    risk_level: "medium"
  },
  CLEANUP_RESPONSE_BUFFER: {
    group: "Response Storage",
    label: "Cleanup recent response buffer",
    description: "Deletes recent buffer rows beyond the keep limit for a session.",
    permission: "dangerous:execute",
    required_phrase: "CLEANUP_RESPONSE_BUFFER",
    route_hint: "POST /ai/response/storage/cleanup",
    risk_level: "medium"
  },
  RESET_DAILY_OPERATION_CHECKLIST: {
    group: "Daily Operation",
    label: "Reset daily operation checklist",
    description: "Resets all checklist items for the selected day.",
    permission: "dangerous:execute",
    required_phrase: "RESET_DAILY_OPERATION_CHECKLIST",
    route_hint: "POST /ai/system/daily-operation-checklist/reset",
    risk_level: "medium"
  },
  RESET_PHASE9_FINAL_CHECKLIST: {
    group: "Phase Final",
    label: "Reset Phase 9 final checklist",
    description: "Resets the Phase 9 final checklist completion state.",
    permission: "dangerous:execute",
    required_phrase: "RESET_PHASE9_FINAL_CHECKLIST",
    route_hint: "POST /ai/system/phase9-final-checklist/reset",
    risk_level: "medium"
  },
  LIVE_PROVIDER_CALL: {
    group: "Model Providers",
    label: "Run live provider call",
    description: "Runs an actual paid external provider call when live=true.",
    permission: "provider:live",
    required_phrase: "LIVE_PROVIDER_CALL",
    route_hint: "OpenAI / Anthropic / Gemini live-test APIs or routed live response test",
    risk_level: "high"
  },
  MANUAL_DB_BACKUP: {
    group: "Backup / Monitoring",
    label: "Run manual database backup",
    description: "Runs mysqldump and writes a compressed DB backup file to the configured backup directory.",
    permission: "dangerous:execute",
    required_phrase: "MANUAL_DB_BACKUP",
    route_hint: "POST /ai/backup/manual/run",
    risk_level: "high"
  },
  TEST_DANGEROUS_CONFIRMATION: {
    group: "Security",
    label: "Dangerous confirmation test",
    description: "Safe test endpoint to verify confirmation and permission enforcement.",
    permission: "dangerous:execute",
    required_phrase: "TEST_DANGEROUS_CONFIRMATION",
    route_hint: "POST /ai/security/dangerous-actions/test-confirmation",
    risk_level: "low"
  }
};

function getDangerousAction(actionKey) {
  const normalized = normalizeActionKey(actionKey);
  return DANGEROUS_ACTIONS[normalized] || null;
}

function isDangerousConfirmationRequired() {
  return truthy(process.env.DANGEROUS_CONFIRMATION_REQUIRED, true);
}

function isDangerousEnforcementEnabled() {
  return truthy(process.env.DANGEROUS_ACTION_ENFORCEMENT_ENABLED, true);
}

function getDangerousActionConfig() {
  return {
    phase: "12-3",
    confirmation_required: isDangerousConfirmationRequired(),
    enforcement_enabled: isDangerousEnforcementEnabled(),
    header_action: "x-admin-confirm-action",
    header_text: "x-admin-confirm-text",
    body_action_paths: ["confirm_action", "confirmation.action_key", "danger_confirm.action_key"],
    body_text_paths: ["confirm_text", "confirmation.confirmation_text", "danger_confirm.confirmation_text"],
    allowed_bypass_roles: splitCsv(process.env.DANGEROUS_CONFIRMATION_BYPASS_ROLES, [])
  };
}

async function ensureDangerousActionEventsTable() {
  if (dangerousEventsTableReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_dangerous_action_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      event_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action_key VARCHAR(120) NOT NULL,
      outcome VARCHAR(30) NOT NULL,
      risk_level VARCHAR(30) NULL,
      required_permission VARCHAR(120) NULL,
      actor_role VARCHAR(60) NULL,
      token_label VARCHAR(40) NULL,
      token_fingerprint VARCHAR(64) NULL,
      confirmation_action VARCHAR(120) NULL,
      confirmation_text_matched TINYINT(1) NOT NULL DEFAULT 0,
      reason VARCHAR(255) NULL,
      method VARCHAR(20) NULL,
      path VARCHAR(500) NULL,
      request_id VARCHAR(80) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_time (event_time),
      INDEX idx_action_key (action_key),
      INDEX idx_outcome (outcome),
      INDEX idx_actor_role (actor_role)
    )
  `);

  dangerousEventsTableReady = true;
}

function extractConfirmation(req) {
  const body = req?.body || {};
  return {
    action_key:
      req?.headers?.["x-admin-confirm-action"] ||
      body.confirm_action ||
      body?.confirmation?.action_key ||
      body?.danger_confirm?.action_key ||
      "",
    confirmation_text:
      req?.headers?.["x-admin-confirm-text"] ||
      body.confirm_text ||
      body?.confirmation?.confirmation_text ||
      body?.danger_confirm?.confirmation_text ||
      ""
  };
}

async function logDangerousActionEvent({ req, actionKey, action, outcome, reason, confirmation = {}, matched = false }) {
  try {
    await ensureDangerousActionEventsTable();
    const actor = getAdminActorFromRequest(req);

    await pool.query(`
      INSERT INTO ai_dangerous_action_events
        (action_key, outcome, risk_level, required_permission, actor_role, token_label, token_fingerprint,
         confirmation_action, confirmation_text_matched, reason, method, path, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      normalizeActionKey(actionKey),
      outcome || "unknown",
      action?.risk_level || null,
      action?.permission || null,
      actor.role || null,
      actor.token_label || null,
      actor.token_fingerprint || null,
      confirmation.action_key || null,
      matched ? 1 : 0,
      reason || null,
      req?.method || null,
      maskUrlToken(req?.originalUrl || req?.url) || null,
      req?.requestId || req?.headers?.["x-request-id"] || null
    ]);
  } catch (error) {
    console.error("[Dangerous Action Event Log Error]", error.message);
  }
}

async function validateDangerousActionRequest({ req, action_key }) {
  const normalizedAction = normalizeActionKey(action_key);
  const action = getDangerousAction(normalizedAction);
  const actor = getAdminActorFromRequest(req);
  const config = getDangerousActionConfig();
  const confirmation = extractConfirmation(req);

  if (!action) {
    return {
      ok: false,
      status: "UNKNOWN_DANGEROUS_ACTION",
      http_status: 400,
      action_key: normalizedAction,
      actor,
      config,
      message: `Unknown dangerous action '${normalizedAction}'.`
    };
  }

  const permission = action.permission || "dangerous:execute";
  const permissionAllowed = hasPermission(actor.role, permission);
  const confirmationRequired = config.confirmation_required && !config.allowed_bypass_roles.includes(actor.role);
  const actionMatched = normalizeActionKey(confirmation.action_key) === normalizedAction;
  const textMatched = String(confirmation.confirmation_text || "").trim() === String(action.required_phrase || normalizedAction).trim();
  const confirmationOk = !confirmationRequired || (actionMatched && textMatched);
  const allowed = permissionAllowed && confirmationOk;

  await logAdminPermissionEvent({
    req,
    outcome: permissionAllowed ? "allowed" : "denied",
    role: actor.role,
    permission,
    event_type: "dangerous_permission_check"
  });

  await logDangerousActionEvent({
    req,
    actionKey: normalizedAction,
    action,
    outcome: allowed ? "allowed" : "denied",
    reason: !permissionAllowed ? "PERMISSION_DENIED" : (!confirmationOk ? "CONFIRMATION_REQUIRED" : "CONFIRMED"),
    confirmation,
    matched: actionMatched && textMatched
  });

  if (!permissionAllowed) {
    return {
      ok: false,
      status: "DANGEROUS_ACTION_PERMISSION_DENIED",
      http_status: 403,
      action_key: normalizedAction,
      actor,
      action,
      config,
      permission_required: permission,
      message: `Role '${actor.role}' does not have permission '${permission}'.`
    };
  }

  if (!confirmationOk) {
    return {
      ok: false,
      status: "DANGEROUS_ACTION_CONFIRMATION_REQUIRED",
      http_status: 409,
      action_key: normalizedAction,
      actor,
      action,
      config,
      confirmation_received: {
        action_key: confirmation.action_key || null,
        action_matched: actionMatched,
        confirmation_text_provided: Boolean(confirmation.confirmation_text),
        confirmation_text_matched: textMatched
      },
      required_confirmation: {
        confirm_action: normalizedAction,
        confirm_text: action.required_phrase || normalizedAction,
        header_example: {
          "x-admin-confirm-action": normalizedAction,
          "x-admin-confirm-text": action.required_phrase || normalizedAction
        },
        body_example: {
          confirm_action: normalizedAction,
          confirm_text: action.required_phrase || normalizedAction
        }
      },
      message: `Dangerous action confirmation is required for '${normalizedAction}'.`
    };
  }

  return {
    ok: true,
    status: "DANGEROUS_ACTION_CONFIRMED",
    phase: "12-3",
    action_key: normalizedAction,
    actor,
    action,
    config,
    permission_required: permission,
    confirmation_received: {
      action_key: confirmation.action_key,
      action_matched: actionMatched,
      confirmation_text_matched: textMatched
    }
  };
}

function requireDangerousAction(actionKey) {
  return async function dangerousActionMiddleware(req, res, next) {
    if (!isDangerousEnforcementEnabled()) {
      req.dangerousAction = {
        ok: true,
        status: "DANGEROUS_ACTION_ENFORCEMENT_DISABLED",
        action_key: normalizeActionKey(actionKey)
      };
      return next();
    }

    const result = await validateDangerousActionRequest({ req, action_key: actionKey });
    req.dangerousAction = result;

    if (result.ok) return next();

    return res.status(result.http_status || 403).json({
      ok: false,
      error: {
        code: result.status,
        message: result.message,
        action_key: result.action_key,
        actor_role: result.actor?.role,
        permission_required: result.permission_required,
        required_confirmation: result.required_confirmation || null,
        confirmation_received: result.confirmation_received || null
      }
    });
  };
}

async function getDangerousActionStatus(req) {
  const actor = getAdminActorFromRequest(req);
  const config = getDangerousActionConfig();

  return {
    ok: true,
    phase: "12-3",
    status: config.enforcement_enabled ? "ENFORCEMENT_ENABLED" : "ENFORCEMENT_DISABLED",
    actor,
    config,
    catalog_count: Object.keys(DANGEROUS_ACTIONS).length,
    warning: config.confirmation_required ? null : "Dangerous confirmation is currently disabled."
  };
}

function getDangerousActionCatalog() {
  return {
    ok: true,
    phase: "12-3",
    count: Object.keys(DANGEROUS_ACTIONS).length,
    results: Object.entries(DANGEROUS_ACTIONS).map(([key, item]) => ({ action_key: key, ...item }))
  };
}

async function getDangerousActionEvents(limit = 50) {
  await ensureDangerousActionEventsTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const [rows] = await pool.query(`
    SELECT *
    FROM ai_dangerous_action_events
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `);

  return {
    ok: true,
    phase: "12-3",
    count: rows.length,
    results: rows
  };
}

module.exports = {
  DANGEROUS_ACTIONS,
  getDangerousAction,
  getDangerousActionStatus,
  getDangerousActionCatalog,
  getDangerousActionEvents,
  validateDangerousActionRequest,
  requireDangerousAction,
  logDangerousActionEvent
};
