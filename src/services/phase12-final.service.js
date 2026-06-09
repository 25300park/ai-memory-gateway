const { getAdminSecurityStatus } = require("./security.service");
const { getPermissionStatus } = require("./admin-permission.service");
const { getDangerousActionStatus } = require("./dangerous-action.service");
const { getApiErrorStandardStatus } = require("./api-error.service");
const { getEnvironmentValidationStatus } = require("./env-config.service");
const { getProductionDeploymentStatus } = require("./deployment-checklist.service");
const { getAdminConsoleModeStatus } = require("./admin-console-mode.service");

function normalizeStatus(value) {
  const text = String(value || "UNKNOWN").toUpperCase();
  if (["GOOD", "READY", "READY_FOR_PRODUCTION", "READY_WITH_MANUAL_CHECKS", "READY_FOR_STAGING"].includes(text)) return "PASS";
  if (["WARNING", "READY_WITH_WARNINGS"].includes(text)) return "WARNING";
  if (["ERROR", "NOT_READY", "FAIL", "FAILED"].includes(text)) return "FAIL";
  return "MANUAL_CHECK";
}

function buildCheck(key, group, label, rawStatus, detail, required = true) {
  const status = normalizeStatus(rawStatus);
  return { key, group, label, status, required, detail: detail || "" };
}

async function getPhase12CompletionChecklist() {
  const adminSecurity = getAdminSecurityStatus();
  const permissions = await getPermissionStatus();
  const dangerous = getDangerousActionStatus();
  const apiErrors = getApiErrorStandardStatus();
  const envConfig = getEnvironmentValidationStatus();
  const deployment = getProductionDeploymentStatus();
  const consoleMode = getAdminConsoleModeStatus();

  const checklist = [
    buildCheck(
      "admin_security_hardened",
      "security",
      "Admin API Security hardening and token rotation are prepared",
      adminSecurity.status,
      `primary=${adminSecurity.primary_token_configured}, secondary=${adminSecurity.secondary_token_configured}, rotation_ready=${adminSecurity.rotation_ready}`
    ),
    buildCheck(
      "role_permissions_ready",
      "security",
      "Role-based admin permission structure is prepared",
      permissions.status || "GOOD",
      `actor_role=${permissions.actor?.role || "unknown"}, enforcement_mode=${permissions.enforcement_mode || "prepared"}`
    ),
    buildCheck(
      "dangerous_actions_protected",
      "security",
      "Dangerous action confirmation and permission checks are enabled",
      dangerous.status,
      `enforcement=${dangerous.enforcement_enabled}, confirmation_required=${dangerous.confirmation_required}`
    ),
    buildCheck(
      "api_errors_standardized",
      "stability",
      "API error responses are standardized",
      apiErrors.status,
      `${apiErrors.standard_format?.fields?.length || 0} standard fields defined`
    ),
    buildCheck(
      "env_config_validated",
      "environment",
      "Environment configuration validation is available",
      envConfig.status,
      `${envConfig.summary?.good_groups || 0} good groups, ${envConfig.summary?.warning_groups || 0} warning groups, ${envConfig.summary?.error_groups || 0} error groups`
    ),
    buildCheck(
      "deployment_checklist_ready",
      "deployment",
      "Production deployment checklist is available",
      deployment.deployment_status,
      `production_entry_allowed=${deployment.production_entry_allowed}`
    ),
    buildCheck(
      "admin_console_mode_ready",
      "console",
      "Admin Console Production Mode / Dev Mode separation is available",
      consoleMode.status,
      `mode=${consoleMode.console_mode}, dev_hidden=${consoleMode.developer_menus_hidden_by_default}`
    ),
    {
      key: "manual_backup_plan",
      group: "manual_operation",
      label: "Backup / restore plan is manually confirmed",
      status: "MANUAL_CHECK",
      required: false,
      detail: "Confirm NAS/database backup and restore procedure before production cutover."
    },
    {
      key: "process_manager_plan",
      group: "manual_operation",
      label: "Process manager / restart plan is manually confirmed",
      status: "MANUAL_CHECK",
      required: false,
      detail: "Confirm how npm run dev / workers will be kept alive in production, for example PM2 or service manager."
    },
    {
      key: "network_access_policy",
      group: "manual_operation",
      label: "Admin URL / network exposure policy is manually confirmed",
      status: "MANUAL_CHECK",
      required: false,
      detail: "Confirm whether admin console is local-only, VPN-only, or exposed with additional gateway protection."
    }
  ];

  const requiredItems = checklist.filter((item) => item.required !== false);
  const failCount = requiredItems.filter((item) => item.status === "FAIL").length;
  const warningCount = requiredItems.filter((item) => item.status === "WARNING").length;
  const manualCount = checklist.filter((item) => item.status === "MANUAL_CHECK").length;
  const passCount = checklist.filter((item) => item.status === "PASS").length;

  return {
    ok: true,
    phase: "12-final",
    checklist_status: failCount ? "NOT_READY" : warningCount ? "READY_WITH_WARNINGS" : "READY",
    summary: {
      total: checklist.length,
      required_total: requiredItems.length,
      pass_count: passCount,
      warning_count: warningCount,
      fail_count: failCount,
      manual_check_count: manualCount
    },
    checklist,
    source_status: {
      admin_security: adminSecurity.status,
      permissions: permissions.status || "GOOD",
      dangerous_actions: dangerous.status,
      api_errors: apiErrors.status,
      environment_config: envConfig.status,
      deployment: deployment.deployment_status,
      admin_console_mode: consoleMode.status
    }
  };
}

async function runPhase12FinalDecision() {
  const checklist = await getPhase12CompletionChecklist();
  const requiredFails = checklist.summary.fail_count;
  const requiredWarnings = checklist.summary.warning_count;
  const manualChecks = checklist.summary.manual_check_count;

  let decisionStatus = "READY_FOR_PHASE_13";
  const warnings = [];
  const errors = [];

  if (requiredFails > 0) {
    decisionStatus = "NOT_READY";
    errors.push(`${requiredFails} required Phase 12 security/deployment check(s) failed.`);
  } else if (requiredWarnings > 0 || manualChecks > 0) {
    decisionStatus = "READY_WITH_MANUAL_CHECKS";
    if (requiredWarnings > 0) warnings.push(`${requiredWarnings} warning item(s) should be reviewed before production cutover.`);
    if (manualChecks > 0) warnings.push(`${manualChecks} manual operation item(s) must be confirmed by the operator.`);
  }

  const phase13EntryAllowed = decisionStatus !== "NOT_READY";

  return {
    ok: true,
    phase: "12-final",
    decision_status: decisionStatus,
    phase13_entry_allowed: phase13EntryAllowed,
    decision_message: phase13EntryAllowed
      ? "Phase 12 security and deployment stabilization is complete enough to enter Phase 13: backup, restore, and monitoring automation."
      : "Phase 12 is not ready. Resolve failed security/deployment checks before entering Phase 13.",
    production_menu_policy: {
      delete_developer_menus: false,
      recommended_treatment: "Hide developer/diagnostic menus in production; keep code available for super-admin troubleshooting.",
      production_env_required_to_hide_dev_menus: {
        ADMIN_CONSOLE_MODE: "production",
        ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS: "true",
        ADMIN_SHOW_DEVELOPER_MENU: "false"
      },
      temporary_dev_access: "Use /admin?token=ADMIN_TOKEN&dev=1 only when diagnostic access is needed."
    },
    recommended_next_phase: "Phase 13-1: Backup / Restore Automation Foundation",
    warnings,
    errors,
    checklist
  };
}

module.exports = {
  getPhase12CompletionChecklist,
  runPhase12FinalDecision
};
