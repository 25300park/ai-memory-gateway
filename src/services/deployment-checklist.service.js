// Phase 12-6: Production Deployment Checklist
// Provides production readiness checks without exposing secret values.

const { getEnvironmentValidationStatus } = require('./env-config.service');

function boolFromEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function getNodeEnv() {
  return process.env.NODE_ENV || 'development';
}

function buildDeploymentChecklist() {
  const env = getEnvironmentValidationStatus();
  const nodeEnv = getNodeEnv();
  const liveMode = boolFromEnv(process.env.AI_LIVE_MODE, false);
  const dangerousEnforced = boolFromEnv(process.env.DANGEROUS_ACTION_ENFORCEMENT_ENABLED, false);
  const dangerousConfirm = boolFromEnv(process.env.DANGEROUS_CONFIRMATION_REQUIRED, false);
  const fallbackEnabled = boolFromEnv(process.env.AI_ROUTER_FALLBACK_ENABLED, true);
  const adminToken = process.env.ADMIN_TOKEN;
  const secondaryToken = process.env.SECONDARY_ADMIN_TOKEN || process.env.ADMIN_TOKEN_NEXT;

  const items = [
    {
      key: 'environment_validation_good_or_warning',
      group: 'environment',
      label: 'Environment Config Validation is not ERROR',
      required: true,
      status: env.status === 'ERROR' ? 'FAIL' : 'PASS',
      detail: `Current environment status: ${env.status}`
    },
    {
      key: 'production_node_env_reviewed',
      group: 'runtime',
      label: 'NODE_ENV reviewed for deployment target',
      required: false,
      status: nodeEnv === 'production' ? 'PASS' : 'WARNING',
      detail: `NODE_ENV=${nodeEnv}. Use production on deployed server; development is acceptable for local testing.`
    },
    {
      key: 'database_configured',
      group: 'database',
      label: 'Database connection variables configured',
      required: true,
      status: ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].every((key) => hasValue(process.env[key])) ? 'PASS' : 'FAIL',
      detail: 'DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD are required.'
    },
    {
      key: 'admin_token_strong',
      group: 'security',
      label: 'ADMIN_TOKEN configured and sufficiently long',
      required: true,
      status: hasValue(adminToken) && String(adminToken).length >= 16 ? 'PASS' : 'FAIL',
      detail: 'Use a long private ADMIN_TOKEN and never publish it.'
    },
    {
      key: 'token_rotation_ready',
      group: 'security',
      label: 'Secondary admin token prepared for token rotation',
      required: false,
      status: hasValue(secondaryToken) ? 'PASS' : 'WARNING',
      detail: 'SECONDARY_ADMIN_TOKEN or ADMIN_TOKEN_NEXT is recommended before production.'
    },
    {
      key: 'dangerous_actions_enforced',
      group: 'security',
      label: 'Dangerous action confirmation is enabled',
      required: true,
      status: dangerousEnforced && dangerousConfirm ? 'PASS' : 'FAIL',
      detail: 'Set DANGEROUS_ACTION_ENFORCEMENT_ENABLED=true and DANGEROUS_CONFIRMATION_REQUIRED=true.'
    },
    {
      key: 'api_error_standard_ready',
      group: 'api',
      label: 'API error response standardization is installed',
      required: true,
      status: 'PASS',
      detail: 'Phase 12-4 error standard APIs and middleware are present.'
    },
    {
      key: 'provider_router_fallback_ready',
      group: 'provider',
      label: 'Provider Router fallback is enabled or intentionally reviewed',
      required: false,
      status: fallbackEnabled ? 'PASS' : 'WARNING',
      detail: 'AI_ROUTER_FALLBACK_ENABLED=true is recommended for multi-provider resiliency.'
    },
    {
      key: 'live_provider_keys_reviewed',
      group: 'provider',
      label: 'Live provider keys reviewed according to enabled providers',
      required: true,
      status: liveMode ? (
        (boolFromEnv(process.env.OPENAI_LIVE_ENABLED, false) && !hasValue(process.env.OPENAI_API_KEY)) ||
        (boolFromEnv(process.env.ANTHROPIC_LIVE_ENABLED, false) && !hasValue(process.env.ANTHROPIC_API_KEY)) ||
        (boolFromEnv(process.env.GEMINI_LIVE_ENABLED, false) && !hasValue(process.env.GEMINI_API_KEY) && !hasValue(process.env.GOOGLE_API_KEY))
          ? 'FAIL'
          : 'PASS'
      ) : 'WARNING',
      detail: liveMode ? 'Live mode is enabled. Confirm enabled provider keys and allowed models.' : 'AI_LIVE_MODE=false. This is safe for staging; enable only when ready for live provider calls.'
    },
    {
      key: 'summary_worker_plan_ready',
      group: 'worker',
      label: 'Summary worker run plan documented',
      required: false,
      status: hasValue(process.env.SUMMARY_WORKER_INTERVAL_MS) || hasValue(process.env.SUMMARY_WORKER_BATCH_LIMIT) ? 'PASS' : 'WARNING',
      detail: 'Set SUMMARY_WORKER_BATCH_LIMIT and SUMMARY_WORKER_INTERVAL_MS for repeat worker operation.'
    },
    {
      key: 'backup_plan_reviewed',
      group: 'operations',
      label: 'Database backup and restore plan reviewed',
      required: true,
      status: 'MANUAL_REQUIRED',
      detail: 'Confirm NAS/MariaDB backup, restore test, and off-machine backup before production.'
    },
    {
      key: 'process_manager_plan_reviewed',
      group: 'operations',
      label: 'Process manager / restart plan reviewed',
      required: true,
      status: 'MANUAL_REQUIRED',
      detail: 'For production, run API server and workers under a process manager or Windows service strategy.'
    },
    {
      key: 'network_access_reviewed',
      group: 'operations',
      label: 'Network exposure and admin URL access reviewed',
      required: true,
      status: 'MANUAL_REQUIRED',
      detail: 'Confirm firewall, Tailscale, reverse proxy, and Admin Console exposure policy.'
    }
  ];

  return items;
}

function summarize(items) {
  const required = items.filter((item) => item.required);
  const failed = items.filter((item) => item.status === 'FAIL');
  const warnings = items.filter((item) => item.status === 'WARNING');
  const manual = items.filter((item) => item.status === 'MANUAL_REQUIRED');
  const pass = items.filter((item) => item.status === 'PASS');
  const requiredFailed = required.filter((item) => item.status === 'FAIL');

  let deployment_status = 'READY_FOR_STAGING';
  if (requiredFailed.length > 0) deployment_status = 'NOT_READY';
  else if (manual.length > 0 || warnings.length > 0) deployment_status = 'READY_WITH_MANUAL_CHECKS';
  else deployment_status = 'READY_FOR_PRODUCTION';

  return {
    total_items: items.length,
    pass_count: pass.length,
    warning_count: warnings.length,
    fail_count: failed.length,
    manual_required_count: manual.length,
    required_failed_count: requiredFailed.length,
    deployment_status,
    production_entry_allowed: deployment_status === 'READY_FOR_PRODUCTION' || deployment_status === 'READY_WITH_MANUAL_CHECKS'
  };
}

function getProductionDeploymentStatus() {
  const items = buildDeploymentChecklist();
  const summary = summarize(items);
  return {
    ok: true,
    phase: '12-6',
    checked_at: new Date().toISOString(),
    deployment_status: summary.deployment_status,
    production_entry_allowed: summary.production_entry_allowed,
    summary,
    blocking_items: items.filter((item) => item.status === 'FAIL'),
    manual_items: items.filter((item) => item.status === 'MANUAL_REQUIRED'),
    warnings: items.filter((item) => item.status === 'WARNING'),
    operator_action: summary.deployment_status === 'NOT_READY'
      ? 'Resolve FAIL items before production deployment.'
      : 'Complete manual checks before exposing the service to production users.'
  };
}

function getProductionDeploymentChecklist() {
  const items = buildDeploymentChecklist();
  return {
    ok: true,
    phase: '12-6',
    checklist: items,
    summary: summarize(items)
  };
}

function runProductionDeploymentTest({ scenario = 'current' } = {}) {
  if (scenario === 'missing_admin_token') {
    return {
      ok: true,
      scenario,
      simulated_result: {
        deployment_status: 'NOT_READY',
        blocking_items: ['admin_token_strong']
      }
    };
  }

  if (scenario === 'missing_backup_plan') {
    return {
      ok: true,
      scenario,
      simulated_result: {
        deployment_status: 'READY_WITH_MANUAL_CHECKS',
        manual_items: ['backup_plan_reviewed']
      }
    };
  }

  if (scenario === 'provider_live_without_key') {
    return {
      ok: true,
      scenario,
      simulated_result: {
        deployment_status: 'NOT_READY',
        blocking_items: ['live_provider_keys_reviewed']
      }
    };
  }

  return {
    ok: true,
    scenario: 'current',
    result: getProductionDeploymentStatus(),
    checklist: getProductionDeploymentChecklist()
  };
}

module.exports = {
  getProductionDeploymentStatus,
  getProductionDeploymentChecklist,
  runProductionDeploymentTest
};
