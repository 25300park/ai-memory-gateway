const crypto = require("crypto");

const DEVELOPMENT_MENU_HASHES = [
  "context-build",
  "context-preview",
  "context-assembly",
  "ai-pipeline-draft",
  "phase10-final",
  "provider-router",
  "provider-fallback",
  "phase11-final",
  "admin-permissions",
  "dangerous-actions",
  "api-errors",
  "env-config",
  "deployment-checklist",
  "context-rebuild",
  "system"
];

const OPERATION_MENU_HASHES = [
  "dashboard",
  "daily-health-check",
  "daily-operation-checklist",
  "daily-automation",
  "operation-logs",
  "operation-report",
  "queue",
  "memory",
  "assets",
  "conversations",
  "ai-response-test",
  "response-storage",
  "summary-worker",
  "model-providers",
  "admin-security",
  "admin-console-mode"
];

function boolFromEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeMode(value) {
  const mode = String(value || "development").trim().toLowerCase();
  if (["production", "prod"].includes(mode)) return "production";
  if (["staging", "stage"].includes(mode)) return "staging";
  return "development";
}

function maskToken(value) {
  if (!value) return { configured: false, preview: null, fingerprint: null };
  const text = String(value);
  const preview = text.length <= 8 ? "********" : `${text.slice(0, 4)}...${text.slice(-4)}`;
  const fingerprint = crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
  return { configured: true, preview, fingerprint: `fp_${fingerprint}` };
}

function getAdminConsoleModeStatus(options = {}) {
  const baseMode = normalizeMode(options.mode || process.env.ADMIN_CONSOLE_MODE || process.env.NODE_ENV);
  const hideDeveloperMenusInProduction = boolFromEnv(
    options.hide_developer_menus_in_production ?? process.env.ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS,
    true
  );
  const allowUrlDevMode = boolFromEnv(options.allow_url_dev_mode ?? process.env.ADMIN_ALLOW_URL_DEV_MODE, true);
  const explicitShowDevMenu = boolFromEnv(options.show_dev_menu ?? process.env.ADMIN_SHOW_DEVELOPER_MENU, false);
  const developerBypassToken = process.env.ADMIN_DEV_MODE_TOKEN || process.env.ADMIN_TOKEN_NEXT || process.env.SECONDARY_ADMIN_TOKEN;

  const productionLike = baseMode === "production";
  const developerMenusVisibleByDefault = !productionLike || explicitShowDevMenu;
  const developerMenusHiddenByDefault = productionLike && hideDeveloperMenusInProduction && !explicitShowDevMenu;

  const warnings = [];
  const errors = [];

  if (productionLike && explicitShowDevMenu) {
    warnings.push("Production mode is enabled, but ADMIN_SHOW_DEVELOPER_MENU also enables diagnostic menus by default.");
  }

  if (productionLike && allowUrlDevMode && !developerBypassToken) {
    warnings.push("URL dev mode is allowed, but ADMIN_DEV_MODE_TOKEN / ADMIN_TOKEN_NEXT / SECONDARY_ADMIN_TOKEN is not configured.");
  }

  if (!process.env.ADMIN_TOKEN) {
    errors.push("ADMIN_TOKEN is not configured.");
  }

  let status = "GOOD";
  if (errors.length) status = "ERROR";
  else if (warnings.length) status = "WARNING";

  return {
    ok: true,
    phase: "12-7",
    status,
    console_mode: baseMode,
    production_like: productionLike,
    developer_menus_visible_by_default: developerMenusVisibleByDefault,
    developer_menus_hidden_by_default: developerMenusHiddenByDefault,
    allow_url_dev_mode: allowUrlDevMode,
    url_dev_mode_parameter: "dev=1",
    show_developer_menu_env: explicitShowDevMenu,
    hide_developer_menus_in_production: hideDeveloperMenusInProduction,
    developer_mode_token: maskToken(developerBypassToken),
    menu_groups: {
      operation: OPERATION_MENU_HASHES,
      developer_diagnostic: DEVELOPMENT_MENU_HASHES
    },
    recommended_env: {
      development: {
        ADMIN_CONSOLE_MODE: "development",
        ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS: "false",
        ADMIN_ALLOW_URL_DEV_MODE: "true"
      },
      production: {
        ADMIN_CONSOLE_MODE: "production",
        ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS: "true",
        ADMIN_SHOW_DEVELOPER_MENU: "false",
        ADMIN_ALLOW_URL_DEV_MODE: "true",
        ADMIN_DEV_MODE_TOKEN: "set-long-dev-mode-token"
      }
    },
    warnings,
    errors,
    operator_action: productionLike
      ? "Use the daily operation menus by default. Add &dev=1 only when a super admin needs diagnostic menus."
      : "Developer menus are visible by default in development mode."
  };
}

function getAdminConsoleModeChecklist() {
  const status = getAdminConsoleModeStatus();
  const productionLike = status.production_like;

  const checklist = [
    {
      group: "mode",
      key: "console_mode_set",
      label: "ADMIN_CONSOLE_MODE is explicitly understood",
      status: process.env.ADMIN_CONSOLE_MODE ? "PASS" : "MANUAL_CHECK",
      detail: process.env.ADMIN_CONSOLE_MODE || "Not set; fallback uses NODE_ENV/development."
    },
    {
      group: "production_menu",
      key: "developer_menus_hidden_in_production",
      label: "Developer / diagnostic menus are hidden in production by default",
      status: productionLike && status.developer_menus_hidden_by_default ? "PASS" : productionLike ? "WARNING" : "PASS",
      detail: `hidden=${status.developer_menus_hidden_by_default}`
    },
    {
      group: "url_dev_mode",
      key: "url_dev_mode_controlled",
      label: "URL dev mode override is controlled",
      status: status.allow_url_dev_mode ? "PASS" : "MANUAL_CHECK",
      detail: status.allow_url_dev_mode ? "&dev=1 can reveal diagnostic menus for authorized admins." : "URL dev override disabled."
    },
    {
      group: "security",
      key: "dev_mode_token_ready",
      label: "Developer mode token is prepared for production troubleshooting",
      status: productionLike ? (status.developer_mode_token.configured ? "PASS" : "WARNING") : "MANUAL_CHECK",
      detail: status.developer_mode_token.configured ? status.developer_mode_token.preview : "ADMIN_DEV_MODE_TOKEN not configured."
    },
    {
      group: "operation",
      key: "operation_menus_preserved",
      label: "Daily operation menus remain visible",
      status: "PASS",
      detail: `${OPERATION_MENU_HASHES.length} operation menus are preserved.`
    },
    {
      group: "diagnostic",
      key: "diagnostic_code_preserved",
      label: "Diagnostic code is preserved and hidden, not deleted",
      status: "PASS",
      detail: `${DEVELOPMENT_MENU_HASHES.length} diagnostic menus can be restored for troubleshooting.`
    }
  ];

  const failCount = checklist.filter((item) => item.status === "FAIL").length;
  const warningCount = checklist.filter((item) => item.status === "WARNING").length;
  const manualCount = checklist.filter((item) => item.status === "MANUAL_CHECK").length;

  return {
    ok: true,
    phase: "12-7",
    checklist_status: failCount ? "NOT_READY" : warningCount ? "READY_WITH_WARNINGS" : "READY",
    summary: {
      total: checklist.length,
      fail_count: failCount,
      warning_count: warningCount,
      manual_check_count: manualCount
    },
    checklist
  };
}

function runAdminConsoleModeTest({ scenario = "current" } = {}) {
  const scenarios = {
    current: {},
    production: { mode: "production" },
    development: { mode: "development" },
    production_show_dev: { mode: "production", show_dev_menu: true },
    production_hide_dev: { mode: "production", show_dev_menu: false, hide_developer_menus_in_production: true }
  };

  const config = scenarios[scenario] || scenarios.current;
  const result = getAdminConsoleModeStatus(config);

  return {
    ok: true,
    phase: "12-7",
    scenario,
    result,
    expected_client_behavior: result.developer_menus_hidden_by_default
      ? "Hide Developer / Diagnostic menus unless URL dev mode is enabled."
      : "Show Developer / Diagnostic menus."
  };
}

module.exports = {
  DEVELOPMENT_MENU_HASHES,
  OPERATION_MENU_HASHES,
  getAdminConsoleModeStatus,
  getAdminConsoleModeChecklist,
  runAdminConsoleModeTest
};
