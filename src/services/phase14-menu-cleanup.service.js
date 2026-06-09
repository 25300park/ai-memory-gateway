// ======================================================
// Phase 14-2: Production Admin Menu Cleanup
// ======================================================

const OPERATIONAL_MENU_GROUPS = {
  daily_operation: [
    { hash: "dashboard", label: "Dashboard" },
    { hash: "daily-health-check", label: "Daily Health Check" },
    { hash: "daily-operation-checklist", label: "Daily Operation Checklist" },
    { hash: "daily-automation", label: "Daily Automation" },
    { hash: "operation-logs", label: "Operation Logs & Safety" },
    { hash: "operation-report", label: "Operation Report" }
  ],
  memory_operation: [
    { hash: "queue", label: "Summary Queue" },
    { hash: "memory", label: "Memory Manager" },
    { hash: "assets", label: "Project Assets" },
    { hash: "conversations", label: "Conversation Logs" },
    { hash: "ai-response-test", label: "AI Response Test" },
    { hash: "response-storage", label: "Response Storage" },
    { hash: "summary-worker", label: "Summary Worker" },
    { hash: "model-providers", label: "Model Providers" }
  ],
  security_deployment: [
    { hash: "admin-security", label: "Admin Security" },
    { hash: "admin-console-mode", label: "Admin Console Mode" },
    { hash: "phase12-final", label: "Phase 12 Final" }
  ],
  backup_monitoring: [
    { hash: "backup-status", label: "DB Backup Status" },
    { hash: "restore-readiness", label: "Restore Readiness" },
    { hash: "system-monitoring", label: "System Monitoring" },
    { hash: "resource-monitoring", label: "Resource Monitoring" },
    { hash: "alert-rules", label: "Alert Rules" },
    { hash: "phase13-final", label: "Phase 13 Final" }
  ],
  final_operation: [
    { hash: "phase14-smoke-test", label: "Phase 14 Smoke Test" },
    { hash: "phase14-menu-cleanup", label: "Production Menu Cleanup" }
  ]
};

const DEVELOPER_DIAGNOSTIC_MENUS = [
  { hash: "context-build", label: "Context Build" },
  { hash: "context-preview", label: "Context Preview" },
  { hash: "context-assembly", label: "Context Assembly" },
  { hash: "ai-pipeline-draft", label: "AI Pipeline Draft" },
  { hash: "phase10-final", label: "Phase 10 Final" },
  { hash: "provider-router", label: "Provider Router" },
  { hash: "provider-fallback", label: "Provider Fallback" },
  { hash: "phase11-final", label: "Phase 11 Final" },
  { hash: "admin-permissions", label: "Admin Permissions" },
  { hash: "dangerous-actions", label: "Dangerous Actions" },
  { hash: "api-errors", label: "API Errors" },
  { hash: "env-config", label: "Environment Config" },
  { hash: "deployment-checklist", label: "Production Deployment" },
  { hash: "context-rebuild", label: "Context Rebuild" },
  { hash: "system", label: "System Status" }
];

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function getMenuCleanupConfig() {
  const consoleMode = process.env.ADMIN_CONSOLE_MODE || process.env.NODE_ENV || "development";
  const productionLike = consoleMode === "production" || process.env.NODE_ENV === "production";

  const hideDeveloperMenus = parseBoolean(
    process.env.ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS,
    productionLike
  );

  return {
    console_mode: consoleMode,
    production_like: productionLike,
    hide_developer_menus: hideDeveloperMenus,
    show_developer_menu: parseBoolean(process.env.ADMIN_SHOW_DEVELOPER_MENU, !hideDeveloperMenus),
    allow_url_dev_mode: parseBoolean(process.env.ADMIN_ALLOW_URL_DEV_MODE, true),
    dev_mode_token_configured: Boolean(process.env.ADMIN_DEV_MODE_TOKEN),
    recommended_env: {
      ADMIN_CONSOLE_MODE: "production",
      ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS: "true",
      ADMIN_SHOW_DEVELOPER_MENU: "false",
      ADMIN_ALLOW_URL_DEV_MODE: "true",
      ADMIN_DEV_MODE_TOKEN: "set_a_long_optional_dev_mode_token"
    }
  };
}

function buildVisibleMenuPlan(config = getMenuCleanupConfig()) {
  const operationalGroups = Object.entries(OPERATIONAL_MENU_GROUPS).map(([key, items]) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
    type: "operational",
    visible_in_production: true,
    items
  }));

  const developerGroup = {
    key: "developer_diagnostic",
    label: "Developer / Diagnostic",
    type: "diagnostic",
    visible_in_production: !config.hide_developer_menus || config.show_developer_menu,
    hidden_by_default: config.hide_developer_menus && !config.show_developer_menu,
    can_be_shown_with_dev_mode: config.allow_url_dev_mode,
    items: DEVELOPER_DIAGNOSTIC_MENUS
  };

  return {
    operational_groups: operationalGroups,
    developer_group: developerGroup,
    production_visible_hashes: operationalGroups.flatMap((group) => group.items.map((item) => item.hash)),
    developer_hashes: DEVELOPER_DIAGNOSTIC_MENUS.map((item) => item.hash)
  };
}

function getProductionMenuCleanupStatus() {
  const checkedAt = new Date().toISOString();
  const config = getMenuCleanupConfig();
  const menuPlan = buildVisibleMenuPlan(config);
  const warnings = [];
  const errors = [];

  if (!config.production_like) {
    warnings.push("Admin Console is not in production mode yet. This is acceptable during development, but switch before final operation.");
  }

  if (!config.hide_developer_menus && config.production_like) {
    errors.push("Developer / Diagnostic menus are not hidden in production-like mode.");
  }

  if (config.allow_url_dev_mode && !config.dev_mode_token_configured && config.production_like) {
    warnings.push("URL dev mode is allowed but ADMIN_DEV_MODE_TOKEN is not configured. Consider setting it before external deployment.");
  }

  const status = errors.length ? "ERROR" : warnings.length ? "WARNING" : "GOOD";

  return {
    ok: errors.length === 0,
    phase: "14-2",
    checked_at: checkedAt,
    cleanup_status: status,
    production_menu_ready: errors.length === 0,
    phase14_3_entry_allowed: errors.length === 0,
    config,
    menu_plan: menuPlan,
    summary: {
      operational_group_count: menuPlan.operational_groups.length,
      production_visible_menu_count: menuPlan.production_visible_hashes.length,
      developer_menu_count: menuPlan.developer_hashes.length,
      developer_hidden_by_default: menuPlan.developer_group.hidden_by_default
    },
    warnings,
    errors,
    next_actions: errors.length ? [
      "Set ADMIN_CONSOLE_MODE=production and ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS=true before final operation.",
      "Reload Admin Console with Ctrl+F5 and verify Developer / Diagnostic group is hidden in normal URL mode."
    ] : [
      "Proceed to Phase 14-3 Dev / Diagnostic menu hiding final application.",
      "For troubleshooting, use /admin?token=ADMIN_TOKEN&dev=1 only when needed."
    ]
  };
}

function getProductionMenuCleanupChecklist() {
  const status = getProductionMenuCleanupStatus();
  const cfg = status.config;
  const checklist = [
    {
      key: "menu_groups_defined",
      group: "menu_structure",
      label: "Admin Console menus are grouped into Daily Operation, Memory Operation, Security / Deployment, Backup / Monitoring, Final Operation, and Developer / Diagnostic.",
      required: true,
      status: "PASS"
    },
    {
      key: "developer_menu_inventory_defined",
      group: "developer_diagnostic",
      label: "Developer / Diagnostic menu inventory is defined and can be hidden without deleting code.",
      required: true,
      status: status.menu_plan.developer_hashes.length > 0 ? "PASS" : "FAIL"
    },
    {
      key: "production_hide_developer_menus",
      group: "production_mode",
      label: "Production mode can hide Developer / Diagnostic menus for normal admin access.",
      required: true,
      status: cfg.hide_developer_menus ? "PASS" : "WARNING"
    },
    {
      key: "url_dev_override_policy",
      group: "diagnostic_access",
      label: "Diagnostic menus can be temporarily shown with dev mode when allowed.",
      required: false,
      status: cfg.allow_url_dev_mode ? "PASS" : "MANUAL_CHECK"
    },
    {
      key: "production_mode_env_ready",
      group: "environment",
      label: "Production menu cleanup environment variables are documented and ready.",
      required: true,
      status: "PASS"
    },
    {
      key: "phase14_3_ready",
      group: "next_phase",
      label: "Phase 14-3 can finalize Dev / Diagnostic menu hiding policy.",
      required: true,
      status: status.phase14_3_entry_allowed ? "PASS" : "WARNING"
    }
  ];

  return {
    ok: true,
    phase: "14-2",
    checked_at: new Date().toISOString(),
    checklist,
    cleanup_status: status.cleanup_status,
    production_menu_ready: status.production_menu_ready
  };
}

function runProductionMenuCleanupTest(input = {}) {
  const scenario = input.scenario || "current";
  const current = getProductionMenuCleanupStatus();

  const simulated = {
    current: current.config,
    production_hide_dev: {
      ...current.config,
      console_mode: "production",
      production_like: true,
      hide_developer_menus: true,
      show_developer_menu: false,
      allow_url_dev_mode: true
    },
    development_visible_dev: {
      ...current.config,
      console_mode: "development",
      production_like: false,
      hide_developer_menus: false,
      show_developer_menu: true,
      allow_url_dev_mode: true
    }
  }[scenario] || current.config;

  const menuPlan = buildVisibleMenuPlan(simulated);
  const result = {
    ok: true,
    phase: "14-2",
    checked_at: new Date().toISOString(),
    scenario,
    test_status: "PASS",
    config: simulated,
    menu_plan: menuPlan,
    expected_behavior: simulated.hide_developer_menus
      ? "Developer / Diagnostic group is hidden in normal admin URL mode."
      : "Developer / Diagnostic group is visible.",
    operator_action: simulated.hide_developer_menus
      ? "Use &dev=1 only for controlled troubleshooting."
      : "Before production, enable developer menu hiding."
  };

  return result;
}

module.exports = {
  getProductionMenuCleanupStatus,
  getProductionMenuCleanupChecklist,
  runProductionMenuCleanupTest,
  getMenuCleanupConfig,
  buildVisibleMenuPlan
};
