const pool = require("../config/db");

let permissionEventsTableReady = false;

function truthy(value) {
  return String(value || "false").toLowerCase() === "true";
}

function splitCsv(value, fallback = []) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

const ROLE_DEFINITIONS = {
  super_admin: {
    label: "Super Admin",
    description: "Full access to all admin and developer operations.",
    permissions: ["*"]
  },
  admin: {
    label: "Admin",
    description: "Operational admin. Can run daily operations and memory operations, but not token/security destructive changes.",
    permissions: [
      "dashboard:read",
      "daily:read", "daily:write", "daily:run",
      "operation:read", "operation:write",
      "memory:read", "memory:write",
      "summary:read", "summary:run",
      "context:read", "context:run",
      "model:read", "model:test",
      "provider:read", "provider:test",
      "report:read",
      "security:read",
      "permission:read", "permission:check"
    ]
  },
  operator: {
    label: "Operator",
    description: "Daily operation user. Can check system status, queues, operation reports, and run safe workers.",
    permissions: [
      "dashboard:read",
      "daily:read", "daily:write", "daily:run",
      "operation:read", "operation:write",
      "summary:read", "summary:run",
      "report:read",
      "memory:read",
      "permission:read"
    ]
  },
  developer: {
    label: "Developer",
    description: "Developer and diagnostic role. Can use context, pipeline, provider test, and diagnostic views.",
    permissions: [
      "dashboard:read",
      "context:read", "context:run",
      "model:read", "model:test",
      "provider:read", "provider:test",
      "pipeline:read", "pipeline:run",
      "memory:read",
      "summary:read",
      "report:read",
      "security:read",
      "permission:read", "permission:check"
    ]
  },
  viewer: {
    label: "Viewer",
    description: "Read-only user for reports and status screens.",
    permissions: [
      "dashboard:read",
      "daily:read",
      "operation:read",
      "memory:read",
      "summary:read",
      "report:read",
      "model:read",
      "provider:read",
      "security:read",
      "permission:read"
    ]
  }
};

const PERMISSION_CATALOG = [
  { key: "dashboard:read", group: "Dashboard", label: "View dashboard" },
  { key: "daily:read", group: "Daily Operation", label: "View daily checks and automation" },
  { key: "daily:write", group: "Daily Operation", label: "Save daily checks and checklist items" },
  { key: "daily:run", group: "Daily Operation", label: "Run daily automation actions" },
  { key: "operation:read", group: "Operation Logs", label: "View operation logs and safety status" },
  { key: "operation:write", group: "Operation Logs", label: "Create operation notes and cleanup logs" },
  { key: "memory:read", group: "Memory", label: "View memory, logs, assets, and storage status" },
  { key: "memory:write", group: "Memory", label: "Create or update memories and project assets" },
  { key: "summary:read", group: "Summary Queue", label: "View summary queue and worker status" },
  { key: "summary:run", group: "Summary Queue", label: "Retry queue and run summary worker actions" },
  { key: "context:read", group: "Context", label: "View context build and preview outputs" },
  { key: "context:run", group: "Context", label: "Run context build, preview, and assembly" },
  { key: "pipeline:read", group: "AI Pipeline", label: "View pipeline diagnostics" },
  { key: "pipeline:run", group: "AI Pipeline", label: "Run pipeline draft and response tests" },
  { key: "model:read", group: "Models", label: "View model provider status" },
  { key: "model:test", group: "Models", label: "Run dry-run or test provider calls" },
  { key: "provider:read", group: "Provider Router", label: "View provider router and fallback status" },
  { key: "provider:test", group: "Provider Router", label: "Run provider router and fallback tests" },
  { key: "provider:live", group: "Provider Router", label: "Run live provider calls" },
  { key: "security:read", group: "Security", label: "View admin security status and auth events" },
  { key: "security:write", group: "Security", label: "Change security-related settings" },
  { key: "permission:read", group: "Permissions", label: "View roles and permission matrix" },
  { key: "permission:check", group: "Permissions", label: "Run permission check diagnostics" },
  { key: "dangerous:execute", group: "Dangerous Actions", label: "Execute dangerous or irreversible actions" },
  { key: "admin:all", group: "Admin", label: "Full admin access alias" },
  { key: "*", group: "Admin", label: "All permissions" }
];

function getRoleForTokenLabel(tokenLabel) {
  const label = String(tokenLabel || "").trim();

  if (label === "primary") {
    return process.env.ADMIN_PRIMARY_ROLE || process.env.ADMIN_TOKEN_ROLE || "super_admin";
  }

  if (label === "secondary") {
    return process.env.ADMIN_SECONDARY_ROLE || process.env.SECONDARY_ADMIN_ROLE || "admin";
  }

  if (label === "disabled") {
    return process.env.ADMIN_DISABLED_ROLE || "super_admin";
  }

  return process.env.ADMIN_DEFAULT_ROLE || "viewer";
}

function normalizeRole(role) {
  const value = String(role || "viewer").trim();
  return ROLE_DEFINITIONS[value] ? value : "viewer";
}

function getRoleDefinition(role) {
  const normalized = normalizeRole(role);
  return {
    role: normalized,
    ...ROLE_DEFINITIONS[normalized]
  };
}

function hasPermission(role, permission) {
  const normalizedRole = normalizeRole(role);
  const permissionKey = String(permission || "").trim();
  const rolePermissions = ROLE_DEFINITIONS[normalizedRole]?.permissions || [];

  if (!permissionKey) return false;
  if (rolePermissions.includes("*") || rolePermissions.includes("admin:all")) return true;
  if (rolePermissions.includes(permissionKey)) return true;

  const [group] = permissionKey.split(":");
  if (group && rolePermissions.includes(`${group}:*`)) return true;

  return false;
}

function getAdminActorFromRequest(req) {
  const tokenLabel = req?.adminAuth?.token_label || "unknown";
  const role = normalizeRole(req?.adminAuth?.role || getRoleForTokenLabel(tokenLabel));

  return {
    token_label: tokenLabel,
    token_source: req?.adminAuth?.token_source || null,
    token_fingerprint: req?.adminAuth?.token_fingerprint || null,
    role,
    role_label: ROLE_DEFINITIONS[role]?.label || role,
    admin_enabled: req?.adminAuth?.admin_enabled !== false
  };
}

async function ensureAdminPermissionEventsTable() {
  if (permissionEventsTableReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_admin_permission_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      event_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      event_type VARCHAR(60) NOT NULL DEFAULT 'permission_check',
      outcome VARCHAR(30) NOT NULL,
      role_name VARCHAR(60) NULL,
      permission_key VARCHAR(120) NULL,
      token_label VARCHAR(40) NULL,
      token_fingerprint VARCHAR(64) NULL,
      method VARCHAR(20) NULL,
      path VARCHAR(500) NULL,
      request_id VARCHAR(80) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_time (event_time),
      INDEX idx_outcome (outcome),
      INDEX idx_role_name (role_name),
      INDEX idx_permission_key (permission_key)
    )
  `);

  permissionEventsTableReady = true;
}

async function logAdminPermissionEvent({ req, outcome, role, permission, event_type = "permission_check" }) {
  try {
    await ensureAdminPermissionEventsTable();
    await pool.query(`
      INSERT INTO ai_admin_permission_events
        (event_type, outcome, role_name, permission_key, token_label, token_fingerprint, method, path, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      event_type,
      outcome || "unknown",
      role || null,
      permission || null,
      req?.adminAuth?.token_label || null,
      req?.adminAuth?.token_fingerprint || null,
      req?.method || null,
      req?.originalUrl || req?.url || null,
      req?.requestId || req?.headers?.["x-request-id"] || null
    ]);
  } catch (error) {
    console.error("[Admin Permission Event Log Error]", error.message);
  }
}

function getRoleAssignments() {
  return {
    primary_token_role: normalizeRole(process.env.ADMIN_PRIMARY_ROLE || process.env.ADMIN_TOKEN_ROLE || "super_admin"),
    secondary_token_role: normalizeRole(process.env.ADMIN_SECONDARY_ROLE || process.env.SECONDARY_ADMIN_ROLE || "admin"),
    default_role: normalizeRole(process.env.ADMIN_DEFAULT_ROLE || "viewer"),
    disabled_auth_role: normalizeRole(process.env.ADMIN_DISABLED_ROLE || "super_admin")
  };
}

function getPermissionStatus(req) {
  const actor = getAdminActorFromRequest(req);
  const roleAssignments = getRoleAssignments();
  const warnings = [];
  const errors = [];

  if (actor.role === "super_admin") {
    warnings.push("Current request has super_admin permissions. Use this only for trusted administrators.");
  }

  if (!truthy(process.env.ADMIN_ENABLED)) {
    warnings.push("ADMIN_ENABLED is false. Role-based checks are informational only while admin auth is disabled.");
  }

  if (roleAssignments.secondary_token_role === "super_admin") {
    warnings.push("Secondary token is mapped to super_admin. For token rotation this is acceptable, but for daily operation prefer admin/operator.");
  }

  return {
    ok: errors.length === 0,
    phase: "12-2",
    status: errors.length ? "ERROR" : warnings.length ? "WARNING" : "GOOD",
    actor,
    role_assignments: roleAssignments,
    role_count: Object.keys(ROLE_DEFINITIONS).length,
    permission_count: PERMISSION_CATALOG.length,
    enforcement_mode: "prepared",
    enforcement_note: "Phase 12-2 prepares role-based permission checks. Full per-route enforcement can be enabled in Phase 12-3/12-4.",
    recommended_env: {
      ADMIN_PRIMARY_ROLE: "super_admin",
      ADMIN_SECONDARY_ROLE: "admin",
      ADMIN_DEFAULT_ROLE: "viewer"
    },
    warnings,
    errors
  };
}

function getRolesMatrix() {
  const roles = Object.keys(ROLE_DEFINITIONS).map((role) => ({
    role,
    label: ROLE_DEFINITIONS[role].label,
    description: ROLE_DEFINITIONS[role].description,
    permissions: ROLE_DEFINITIONS[role].permissions,
    permission_count: ROLE_DEFINITIONS[role].permissions.includes("*") ? PERMISSION_CATALOG.length : ROLE_DEFINITIONS[role].permissions.length
  }));

  return {
    ok: true,
    phase: "12-2",
    roles,
    permission_catalog: PERMISSION_CATALOG,
    total_roles: roles.length,
    total_permissions: PERMISSION_CATALOG.length
  };
}

function getPermissionPolicies() {
  const policies = [
    {
      area: "Daily Operation",
      permissions: ["daily:read", "daily:write", "daily:run"],
      recommended_roles: ["super_admin", "admin", "operator"]
    },
    {
      area: "Memory Management",
      permissions: ["memory:read", "memory:write"],
      recommended_roles: ["super_admin", "admin"]
    },
    {
      area: "Summary Worker",
      permissions: ["summary:read", "summary:run"],
      recommended_roles: ["super_admin", "admin", "operator"]
    },
    {
      area: "Provider Live Calls",
      permissions: ["provider:live"],
      recommended_roles: ["super_admin"]
    },
    {
      area: "Security",
      permissions: ["security:read", "security:write", "permission:read", "permission:check"],
      recommended_roles: ["super_admin", "admin"]
    },
    {
      area: "Dangerous Actions",
      permissions: ["dangerous:execute"],
      recommended_roles: ["super_admin"]
    }
  ];

  return {
    ok: true,
    phase: "12-2",
    policies,
    enforcement_recommendation: [
      "Use role checks first on dangerous POST/PATCH APIs.",
      "Keep read-only dashboards available to viewer/operator roles.",
      "Restrict live provider calls and token/security operations to super_admin.",
      "Add explicit confirmation for dangerous actions in Phase 12-3."
    ]
  };
}

async function checkAdminPermission({ req, role, permission }) {
  const actor = req ? getAdminActorFromRequest(req) : null;
  const effectiveRole = normalizeRole(role || actor?.role || "viewer");
  const permissionKey = String(permission || "").trim();
  const allowed = hasPermission(effectiveRole, permissionKey);

  if (req) {
    await logAdminPermissionEvent({
      req,
      outcome: allowed ? "allowed" : "denied",
      role: effectiveRole,
      permission: permissionKey
    });
  }

  return {
    ok: true,
    phase: "12-2",
    allowed,
    role: effectiveRole,
    role_label: ROLE_DEFINITIONS[effectiveRole]?.label || effectiveRole,
    permission: permissionKey,
    actor,
    reason: allowed ? "ROLE_HAS_PERMISSION" : "ROLE_PERMISSION_NOT_GRANTED",
    role_permissions: ROLE_DEFINITIONS[effectiveRole]?.permissions || []
  };
}

function requireAdminPermission(permission) {
  return async function permissionMiddleware(req, res, next) {
    const actor = getAdminActorFromRequest(req);
    const allowed = hasPermission(actor.role, permission);

    await logAdminPermissionEvent({
      req,
      outcome: allowed ? "allowed" : "denied",
      role: actor.role,
      permission
    });

    if (allowed) return next();

    return res.status(403).json({
      ok: false,
      error: {
        code: "ADMIN_PERMISSION_DENIED",
        message: `Admin role '${actor.role}' does not have permission '${permission}'.`,
        role: actor.role,
        permission
      }
    });
  };
}

async function getAdminPermissionEvents(limit = 50) {
  await ensureAdminPermissionEventsTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const [rows] = await pool.query(`
    SELECT *
    FROM ai_admin_permission_events
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `);

  return {
    ok: true,
    phase: "12-2",
    count: rows.length,
    results: rows
  };
}

module.exports = {
  ROLE_DEFINITIONS,
  PERMISSION_CATALOG,
  getRoleForTokenLabel,
  normalizeRole,
  getRoleDefinition,
  hasPermission,
  getAdminActorFromRequest,
  getPermissionStatus,
  getRolesMatrix,
  getPermissionPolicies,
  checkAdminPermission,
  requireAdminPermission,
  getAdminPermissionEvents,
  logAdminPermissionEvent
};
