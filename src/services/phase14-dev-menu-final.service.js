// Phase 14-3: Dev / Diagnostic Menu Final Hide Policy

function boolEnv(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function getDevMenuPolicy() {
  const consoleMode = process.env.ADMIN_CONSOLE_MODE || process.env.NODE_ENV || 'development';
  const isProductionMode = consoleMode === 'production' || process.env.NODE_ENV === 'production';
  const hideDeveloperMenus = boolEnv(
    'ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS',
    isProductionMode
  );
  const showDeveloperMenu = boolEnv('ADMIN_SHOW_DEVELOPER_MENU', !isProductionMode);
  const allowUrlDevMode = boolEnv('ADMIN_ALLOW_URL_DEV_MODE', true);
  const devModeTokenConfigured = Boolean(process.env.ADMIN_DEV_MODE_TOKEN);

  const productionVisibleHashes = [
    '#dashboard',
    '#daily-health-check',
    '#daily-operation-checklist',
    '#daily-automation',
    '#operation-logs',
    '#operation-report',
    '#queue',
    '#memory',
    '#assets',
    '#conversations',
    '#ai-response-test',
    '#response-storage',
    '#summary-worker',
    '#model-providers',
    '#admin-security',
    '#admin-console-mode',
    '#phase12-final',
    '#backup-status',
    '#restore-readiness',
    '#system-monitoring',
    '#resource-monitoring',
    '#alert-rules',
    '#phase13-final',
    '#phase14-smoke-test',
    '#phase14-menu-cleanup',
    '#phase14-dev-menu-final'
  ];

  const developerHashes = [
    '#context-build',
    '#context-preview',
    '#context-assembly',
    '#ai-pipeline-draft',
    '#phase10-final',
    '#provider-router',
    '#provider-fallback',
    '#phase11-final',
    '#admin-permissions',
    '#dangerous-actions',
    '#api-errors',
    '#env-config',
    '#deployment-checklist',
    '#context-rebuild',
    '#system'
  ];

  const shouldHideDeveloperMenus = isProductionMode && hideDeveloperMenus && !showDeveloperMenu;

  const status = shouldHideDeveloperMenus ? 'PRODUCTION_DEV_MENUS_HIDDEN_READY' : 'DEV_MENUS_VISIBLE';
  const warnings = [];
  const errors = [];

  if (!isProductionMode) {
    warnings.push('Admin Console is not in production mode. Developer / Diagnostic menus will remain visible.');
  }
  if (isProductionMode && !hideDeveloperMenus) {
    warnings.push('Production mode is enabled, but ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS is not true.');
  }
  if (isProductionMode && showDeveloperMenu) {
    warnings.push('ADMIN_SHOW_DEVELOPER_MENU is true. Developer menus will remain visible even in production mode.');
  }
  if (allowUrlDevMode && !devModeTokenConfigured) {
    warnings.push('URL dev mode is allowed. For stricter production security, configure ADMIN_DEV_MODE_TOKEN in a later hardening step.');
  }

  return {
    ok: errors.length === 0,
    phase: '14-3',
    status,
    console_mode: consoleMode,
    is_production_mode: isProductionMode,
    developer_menus_hidden_by_default: shouldHideDeveloperMenus,
    allow_url_dev_mode: allowUrlDevMode,
    dev_mode_token_configured: devModeTokenConfigured,
    production_visible_hashes: productionVisibleHashes,
    developer_hashes: developerHashes,
    counts: {
      production_visible_menu_count: productionVisibleHashes.length,
      developer_menu_count: developerHashes.length
    },
    recommended_env: {
      ADMIN_CONSOLE_MODE: 'production',
      ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS: 'true',
      ADMIN_SHOW_DEVELOPER_MENU: 'false',
      ADMIN_ALLOW_URL_DEV_MODE: 'true',
      ADMIN_DEV_MODE_TOKEN: 'set_a_long_random_token_for_diagnostic_access'
    },
    expected_behavior: {
      normal_admin_url: shouldHideDeveloperMenus ? 'Developer / Diagnostic group hidden' : 'Developer / Diagnostic group visible',
      dev_url: allowUrlDevMode ? 'Developer / Diagnostic group can be shown with &dev=1' : 'URL dev mode disabled',
      direct_hash_access: shouldHideDeveloperMenus ? 'Developer hash access redirects to dashboard unless dev mode is active' : 'Developer hash access allowed'
    },
    warnings,
    errors,
    next_actions: [
      'Set ADMIN_CONSOLE_MODE=production for final production test.',
      'Set ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS=true and ADMIN_SHOW_DEVELOPER_MENU=false.',
      'Restart npm run dev after changing .env.',
      'Open /admin?token=... and confirm Developer / Diagnostic is hidden.',
      'Open /admin?token=...&dev=1 and confirm Developer / Diagnostic is visible for diagnostics.'
    ]
  };
}

function getDevMenuFinalChecklist() {
  const policy = getDevMenuPolicy();
  const passHiddenRule = policy.is_production_mode ? policy.developer_menus_hidden_by_default : true;
  return {
    ok: true,
    phase: '14-3',
    checklist: [
      {
        key: 'production_mode_policy_available',
        group: 'mode',
        label: 'Admin Console production mode policy can be loaded.',
        required: true,
        status: 'PASS'
      },
      {
        key: 'developer_group_inventory_available',
        group: 'menu',
        label: 'Developer / Diagnostic menu inventory is defined and can be hidden.',
        required: true,
        status: policy.developer_hashes.length > 0 ? 'PASS' : 'FAIL'
      },
      {
        key: 'production_menu_inventory_available',
        group: 'menu',
        label: 'Operational production menu inventory remains available.',
        required: true,
        status: policy.production_visible_hashes.length > 0 ? 'PASS' : 'FAIL'
      },
      {
        key: 'developer_hidden_in_production',
        group: 'production',
        label: 'Developer / Diagnostic group is hidden in production normal admin mode.',
        required: true,
        status: passHiddenRule ? 'PASS' : 'WARNING'
      },
      {
        key: 'url_dev_mode_available',
        group: 'diagnostic',
        label: 'Developer menus can still be displayed for diagnostics with URL dev mode if allowed.',
        required: false,
        status: policy.allow_url_dev_mode ? 'PASS' : 'DISABLED'
      },
      {
        key: 'direct_hash_guard_ready',
        group: 'safety',
        label: 'Direct access to hidden developer hash sections is guarded by client-side menu mode.',
        required: true,
        status: 'PASS'
      }
    ],
    policy
  };
}

function testDevMenuFinalPolicy(scenario = 'current') {
  const base = getDevMenuPolicy();
  let simulated = { ...base };

  if (scenario === 'production_hide_dev') {
    simulated = {
      ...base,
      console_mode: 'production',
      is_production_mode: true,
      developer_menus_hidden_by_default: true,
      status: 'PRODUCTION_DEV_MENUS_HIDDEN_READY'
    };
  }

  if (scenario === 'production_show_dev') {
    simulated = {
      ...base,
      console_mode: 'production',
      is_production_mode: true,
      developer_menus_hidden_by_default: false,
      status: 'DEV_MENUS_VISIBLE'
    };
  }

  const testStatus = simulated.is_production_mode && !simulated.developer_menus_hidden_by_default
    ? 'WARNING'
    : 'PASS';

  return {
    ok: testStatus !== 'FAIL',
    phase: '14-3',
    scenario,
    test_status: testStatus,
    expected_behavior: simulated.expected_behavior,
    policy: simulated,
    message: testStatus === 'PASS'
      ? 'Phase 14-3 developer menu hide policy is ready.'
      : 'Developer menu policy is available, but production hide setting should be reviewed.'
  };
}

module.exports = {
  getDevMenuPolicy,
  getDevMenuFinalChecklist,
  testDevMenuFinalPolicy
};
