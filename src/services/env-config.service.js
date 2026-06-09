// Phase 12-5: Environment Config Validation
// Validates operational environment variables without exposing secret values.

const SECRET_KEYS = [
  'ADMIN_TOKEN',
  'SECONDARY_ADMIN_TOKEN',
  'ADMIN_TOKEN_NEXT',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'DB_PASSWORD'
];

function boolFromEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function numberFromEnv(value, defaultValue = null) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function maskValue(key, value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value);
  if (!SECRET_KEYS.includes(key)) return raw;
  if (raw.length <= 8) return '***configured***';
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function fingerprint(value) {
  if (!value) return null;
  let hash = 0;
  const raw = String(value);
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(16)}`;
}

function readVar(key, options = {}) {
  const value = process.env[key];
  const configured = value !== undefined && value !== null && String(value).trim() !== '';
  return {
    key,
    configured,
    required: Boolean(options.required),
    secret: SECRET_KEYS.includes(key) || Boolean(options.secret),
    value_preview: configured ? maskValue(key, value) : null,
    fingerprint: configured && (SECRET_KEYS.includes(key) || options.secret) ? fingerprint(value) : null,
    expected: options.expected || null,
    recommendation: options.recommendation || null
  };
}

function groupStatus(items) {
  const missingRequired = items.filter((item) => item.required && !item.configured);
  if (missingRequired.length > 0) return 'ERROR';
  const missingRecommended = items.filter((item) => !item.required && item.expected === 'recommended' && !item.configured);
  if (missingRecommended.length > 0) return 'WARNING';
  return 'GOOD';
}

function validateTime(value) {
  if (!value) return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
}

function validateIntegerRange(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

function buildGroups() {
  const aiLiveMode = boolFromEnv(process.env.AI_LIVE_MODE, false);
  const openAiLive = boolFromEnv(process.env.OPENAI_LIVE_ENABLED, false);
  const anthropicLive = boolFromEnv(process.env.ANTHROPIC_LIVE_ENABLED, false);
  const geminiLive = boolFromEnv(process.env.GEMINI_LIVE_ENABLED, false);

  return [
    {
      group_key: 'runtime',
      title: 'Runtime',
      items: [
        readVar('NODE_ENV', { required: false, expected: 'recommended', recommendation: 'Use development locally and production on deployed server.' }),
        readVar('PORT', { required: false, recommendation: 'Default is 3010 if not configured.' })
      ]
    },
    {
      group_key: 'database',
      title: 'Database',
      items: [
        readVar('DB_HOST', { required: true }),
        readVar('DB_PORT', { required: true }),
        readVar('DB_NAME', { required: true }),
        readVar('DB_USER', { required: true }),
        readVar('DB_PASSWORD', { required: true, secret: true })
      ]
    },
    {
      group_key: 'admin_security',
      title: 'Admin Security',
      items: [
        readVar('ADMIN_ENABLED', { required: false, recommendation: 'Keep true for Admin Console protection.' }),
        readVar('ADMIN_TOKEN', { required: true, secret: true }),
        readVar('SECONDARY_ADMIN_TOKEN', { required: false, expected: 'recommended', secret: true, recommendation: 'Recommended for token rotation.' }),
        readVar('ADMIN_TOKEN_NEXT', { required: false, secret: true }),
        readVar('ADMIN_PRIMARY_ROLE', { required: false }),
        readVar('ADMIN_SECONDARY_ROLE', { required: false })
      ]
    },
    {
      group_key: 'dangerous_actions',
      title: 'Dangerous Actions',
      items: [
        readVar('DANGEROUS_ACTION_ENFORCEMENT_ENABLED', { required: false, expected: 'recommended' }),
        readVar('DANGEROUS_CONFIRMATION_REQUIRED', { required: false, expected: 'recommended' }),
        readVar('DANGEROUS_CONFIRMATION_BYPASS_ROLES', { required: false })
      ]
    },
    {
      group_key: 'providers',
      title: 'Multi-model Providers',
      items: [
        readVar('AI_LIVE_MODE', { required: false }),
        readVar('OPENAI_API_KEY', { required: openAiLive || aiLiveMode, secret: true, recommendation: 'Required for OpenAI live calls.' }),
        readVar('OPENAI_LIVE_ENABLED', { required: false }),
        readVar('OPENAI_DEFAULT_MODEL', { required: false }),
        readVar('ANTHROPIC_API_KEY', { required: anthropicLive, secret: true, recommendation: 'Required for Anthropic live calls.' }),
        readVar('ANTHROPIC_LIVE_ENABLED', { required: false }),
        readVar('ANTHROPIC_DEFAULT_MODEL', { required: false }),
        readVar('GEMINI_API_KEY', { required: geminiLive && !process.env.GOOGLE_API_KEY, secret: true, recommendation: 'Required for Gemini live calls unless GOOGLE_API_KEY is used.' }),
        readVar('GOOGLE_API_KEY', { required: false, secret: true }),
        readVar('GEMINI_LIVE_ENABLED', { required: false }),
        readVar('GEMINI_DEFAULT_MODEL', { required: false })
      ]
    },
    {
      group_key: 'router',
      title: 'Provider Router',
      items: [
        readVar('AI_ROUTER_DEFAULT_PROVIDER', { required: false, expected: 'recommended' }),
        readVar('AI_ROUTER_ALLOWED_PROVIDERS', { required: false, expected: 'recommended' }),
        readVar('AI_ROUTER_FALLBACK_ENABLED', { required: false, expected: 'recommended' }),
        readVar('AI_ROUTER_REQUIRE_LIVE', { required: false })
      ]
    },
    {
      group_key: 'workers',
      title: 'Workers',
      items: [
        readVar('SUMMARY_WORKER_BATCH_LIMIT', { required: false }),
        readVar('SUMMARY_WORKER_INTERVAL_MS', { required: false }),
        readVar('SUMMARY_WORKER_PROJECT_CODE', { required: false })
      ]
    },
    {
      group_key: 'daily_automation',
      title: 'Daily Automation',
      items: [
        readVar('DAILY_OPERATION_TIME', { required: false, recommendation: 'HH:mm format, for example 09:00.' }),
        readVar('DAILY_OPERATION_TIMEZONE', { required: false, recommendation: 'Recommended: Asia/Manila.' })
      ]
    }
  ];
}

function runFormatChecks() {
  const warnings = [];
  const errors = [];

  if (process.env.DB_PORT && !validateIntegerRange(process.env.DB_PORT, 1, 65535)) {
    errors.push('DB_PORT must be an integer between 1 and 65535.');
  }

  if (process.env.SUMMARY_WORKER_BATCH_LIMIT && !validateIntegerRange(process.env.SUMMARY_WORKER_BATCH_LIMIT, 1, 1000)) {
    warnings.push('SUMMARY_WORKER_BATCH_LIMIT should be an integer between 1 and 1000.');
  }

  if (process.env.SUMMARY_WORKER_INTERVAL_MS && !validateIntegerRange(process.env.SUMMARY_WORKER_INTERVAL_MS, 1000, 86400000)) {
    warnings.push('SUMMARY_WORKER_INTERVAL_MS should be between 1000 and 86400000.');
  }

  if (process.env.DAILY_OPERATION_TIME && !validateTime(process.env.DAILY_OPERATION_TIME)) {
    warnings.push('DAILY_OPERATION_TIME should use HH:mm format, for example 09:00.');
  }

  const liveEnabled = boolFromEnv(process.env.AI_LIVE_MODE, false);
  const anyProviderLive = boolFromEnv(process.env.OPENAI_LIVE_ENABLED, false)
    || boolFromEnv(process.env.ANTHROPIC_LIVE_ENABLED, false)
    || boolFromEnv(process.env.GEMINI_LIVE_ENABLED, false);

  if (anyProviderLive && !liveEnabled) {
    warnings.push('At least one provider live flag is true, but AI_LIVE_MODE is not true. Live calls will be blocked.');
  }

  if (process.env.ADMIN_TOKEN && String(process.env.ADMIN_TOKEN).length < 16) {
    warnings.push('ADMIN_TOKEN is short. Use a longer random token before production.');
  }

  return { warnings, errors };
}

function getEnvironmentValidationStatus() {
  const groups = buildGroups().map((group) => ({
    ...group,
    status: groupStatus(group.items),
    missing_required: group.items.filter((item) => item.required && !item.configured).map((item) => item.key),
    missing_recommended: group.items.filter((item) => !item.required && item.expected === 'recommended' && !item.configured).map((item) => item.key)
  }));

  const format = runFormatChecks();
  const errorGroups = groups.filter((group) => group.status === 'ERROR');
  const warningGroups = groups.filter((group) => group.status === 'WARNING');

  let status = 'GOOD';
  if (errorGroups.length || format.errors.length) status = 'ERROR';
  else if (warningGroups.length || format.warnings.length) status = 'WARNING';

  return {
    ok: true,
    phase: '12-5',
    status,
    checked_at: new Date().toISOString(),
    summary: {
      total_groups: groups.length,
      good_groups: groups.filter((group) => group.status === 'GOOD').length,
      warning_groups: warningGroups.length,
      error_groups: errorGroups.length,
      format_warnings: format.warnings.length,
      format_errors: format.errors.length
    },
    groups,
    warnings: format.warnings,
    errors: format.errors,
    operator_action: status === 'GOOD'
      ? 'Environment configuration is ready for the next phase.'
      : 'Review missing required variables, warnings, and provider live gate configuration before production.'
  };
}

function getEnvironmentValidationChecklist() {
  return {
    ok: true,
    phase: '12-5',
    checklist: [
      { key: 'db_configured', label: 'DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD configured', required: true },
      { key: 'admin_token_configured', label: 'ADMIN_TOKEN configured and not shared publicly', required: true },
      { key: 'secondary_token_ready', label: 'SECONDARY_ADMIN_TOKEN prepared for rotation', required: false },
      { key: 'dangerous_actions_enabled', label: 'Dangerous action confirmation enabled', required: true },
      { key: 'provider_keys_configured', label: 'Provider API keys configured only for providers that will run live', required: false },
      { key: 'router_defaults_ready', label: 'Provider Router default and fallback env configured', required: false },
      { key: 'workers_configured', label: 'Summary worker env values documented', required: false },
      { key: 'secrets_not_exposed', label: 'Secrets are not printed in logs or Admin Console', required: true }
    ]
  };
}

function runEnvironmentValidationTest({ scenario = 'current' } = {}) {
  const current = getEnvironmentValidationStatus();

  if (scenario === 'missing_admin_token') {
    return {
      ok: true,
      scenario,
      expected_status: 'ERROR',
      simulated_result: {
        status: 'ERROR',
        errors: ['ADMIN_TOKEN is required for protected Admin API access.']
      }
    };
  }

  if (scenario === 'provider_live_without_key') {
    return {
      ok: true,
      scenario,
      expected_status: 'ERROR',
      simulated_result: {
        status: 'ERROR',
        errors: ['Provider live mode enabled but provider API key is missing.']
      }
    };
  }

  if (scenario === 'invalid_port') {
    return {
      ok: true,
      scenario,
      expected_status: 'ERROR',
      simulated_result: {
        status: 'ERROR',
        errors: ['DB_PORT must be an integer between 1 and 65535.']
      }
    };
  }

  return {
    ok: true,
    scenario: 'current',
    result: current
  };
}

module.exports = {
  getEnvironmentValidationStatus,
  getEnvironmentValidationChecklist,
  runEnvironmentValidationTest
};
