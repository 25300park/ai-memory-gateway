const { runPhase13FinalDecision } = require("./phase13-final.service");
const { getAdminSecurityStatus } = require("./security.service");
const { getDatabaseBackupStatus, getRestoreReadinessStatus, getBackupHistoryStats } = require("./backup-status.service");
const { getSystemMonitoringDashboard, getDetailedResourceMonitoring, getWorkerMonitoringStatus, getAlertRulesStatus } = require("./system-monitoring.service");
const { getProviderRouterStatus, selectProviderRoute } = require("./provider-router.service");
const { runMemoryContextResponseTest } = require("./ai-response-test.service");

function normalizeStatus(value) {
  const status = String(value || "UNKNOWN").toUpperCase();
  if (["GOOD", "READY", "READY_FOR_PHASE_14", "READY_WITH_MANUAL_CHECKS", "READY_FOR_PHASE_14_2", "PASS", "OK"].includes(status)) return "PASS";
  if (["WARNING", "READY_WITH_WARNINGS", "WARNING_ACCEPTABLE", "MANUAL_CHECK", "READY_WITH_MANUAL_CHECKS"].includes(status)) return "WARNING";
  if (["ERROR", "NOT_READY", "FAIL", "FAILED"].includes(status)) return "FAIL";
  return "WARNING";
}

function buildCheck({ key, group, label, raw_status, evidence, required = true, operator_action }) {
  return {
    key,
    group,
    label,
    required,
    status: normalizeStatus(raw_status),
    raw_status: raw_status || null,
    evidence: evidence || {},
    operator_action: operator_action || null
  };
}

function summarizeChecklist(checklist) {
  const requiredItems = checklist.filter((item) => item.required !== false);
  const failCount = requiredItems.filter((item) => item.status === "FAIL").length;
  const warningCount = requiredItems.filter((item) => item.status === "WARNING").length;
  const passCount = checklist.filter((item) => item.status === "PASS").length;
  const completionPercent = requiredItems.length
    ? Math.round(((requiredItems.length - failCount) / requiredItems.length) * 100)
    : 100;

  return {
    total: checklist.length,
    required_total: requiredItems.length,
    pass_count: passCount,
    warning_count: warningCount,
    fail_count: failCount,
    completion_percent: completionPercent
  };
}

async function safeRun(name, fn) {
  try {
    const result = await fn();
    return { name, ok: true, result };
  } catch (error) {
    return { name, ok: false, error: error.message };
  }
}

async function buildPhase14SmokeChecklist(options = {}) {
  const projectCode = options.project_code || "rbs_ai_memory";
  const sessionId = options.session_id || "phase-14-1-smoke-test";
  const runResponseSmokeTest = options.run_response_smoke_test === true;

  const [
    phase13Final,
    adminSecurity,
    backupStatus,
    backupHistory,
    restoreReadiness,
    systemMonitoring,
    resourceMonitoring,
    workerStatus,
    alertStatus,
    routerStatus,
    routerSelection
  ] = await Promise.all([
    safeRun("phase13_final", () => runPhase13FinalDecision({ allow_manual_checks: true })),
    safeRun("admin_security", () => Promise.resolve(getAdminSecurityStatus())),
    safeRun("backup_status", () => getDatabaseBackupStatus()),
    safeRun("backup_history", () => getBackupHistoryStats({ days: 30 })),
    safeRun("restore_readiness", () => getRestoreReadinessStatus()),
    safeRun("system_monitoring", () => getSystemMonitoringDashboard()),
    safeRun("resource_monitoring", () => getDetailedResourceMonitoring()),
    safeRun("worker_status", () => getWorkerMonitoringStatus()),
    safeRun("alert_rules", () => getAlertRulesStatus()),
    safeRun("provider_router_status", () => getProviderRouterStatus()),
    safeRun("provider_router_select", () => selectProviderRoute({
      intent: "general",
      force_provider: "mock",
      live: false,
      allow_fallback: false,
      prompt: "Phase 14-1 provider router smoke test."
    }))
  ]);

  let responseSmoke = null;
  if (runResponseSmokeTest) {
    responseSmoke = await safeRun("ai_response_mock_smoke", () => runMemoryContextResponseTest({
      project_code: projectCode,
      session_id: sessionId,
      user_id: "phase14-smoke-test",
      question: options.question || "Phase 14-1 final smoke test with mock provider and memory context.",
      save_to_memory: false,
      create_summary_queue: false,
      use_provider_router: true,
      force_provider: "mock",
      live: false,
      allow_fallback: false,
      use_assembly: true,
      include_prompt: false,
      include_packet: false
    }));
  }

  const phase13Decision = phase13Final.result || {};
  const backupDir = backupStatus.result?.backup_directory || {};
  const backupHistorySummary = backupHistory.result?.summary || {};
  const restoreStatus = restoreReadiness.result?.restore_readiness_status || restoreReadiness.result?.restore_status;
  const systemStatus = systemMonitoring.result?.monitoring_status;
  const resourceStatus = resourceMonitoring.result?.monitoring_status;
  const alertRuleStatus = alertStatus.result?.alert_status;
  const routerRouteStatus = routerSelection.result?.route_status || routerSelection.result?.route?.route_status;

  const phase13Allowed = phase13Decision.phase14_entry_allowed === true || ["READY_FOR_PHASE_14", "READY_WITH_MANUAL_CHECKS"].includes(phase13Decision.decision_status);

  const checklist = [
    buildCheck({
      key: "phase13_final_entry_allowed",
      group: "previous_phase",
      label: "Phase 13 Final allows Phase 14 entry.",
      raw_status: phase13Allowed ? (phase13Decision.decision_status || "READY_WITH_MANUAL_CHECKS") : "FAIL",
      evidence: {
        decision_status: phase13Decision.decision_status,
        phase14_entry_allowed: phase13Decision.phase14_entry_allowed,
        completion_percent: phase13Decision.completion_percent
      },
      operator_action: "Resolve Phase 13 blocking items before final production cutover."
    }),
    buildCheck({
      key: "admin_security_available",
      group: "security",
      label: "Admin Security status can be loaded.",
      raw_status: adminSecurity.ok ? (adminSecurity.result?.status || "GOOD") : "FAIL",
      evidence: adminSecurity.ok ? {
        admin_enabled: adminSecurity.result?.admin_enabled,
        primary_token_configured: adminSecurity.result?.primary_token_configured,
        rotation_ready: adminSecurity.result?.rotation_ready
      } : { error: adminSecurity.error }
    }),
    buildCheck({
      key: "backup_status_available",
      group: "backup",
      label: "Database Backup Status is available and backup directory is writable.",
      raw_status: backupStatus.ok && backupDir.exists && backupDir.writable ? backupStatus.result?.backup_status || "GOOD" : "FAIL",
      evidence: {
        backup_status_ok: backupStatus.ok,
        directory_exists: backupDir.exists,
        directory_writable: backupDir.writable,
        backup_file_count: backupDir.backup_file_count || 0,
        latest_backup: backupDir.latest_backup || null
      }
    }),
    buildCheck({
      key: "backup_history_available",
      group: "backup",
      label: "Backup History storage and stats are available.",
      raw_status: backupHistory.ok ? (Number(backupHistorySummary.success_count || 0) > 0 ? "GOOD" : "WARNING") : "FAIL",
      evidence: backupHistory.ok ? backupHistorySummary : { error: backupHistory.error },
      operator_action: "Create at least one successful manual DB backup before production launch."
    }),
    buildCheck({
      key: "restore_readiness_available",
      group: "recovery",
      label: "Restore Readiness can be loaded and restore execution remains safely disabled.",
      raw_status: restoreReadiness.ok || String(restoreStatus || "").toUpperCase() === "READY_WITH_MANUAL_CHECKS" ? (restoreStatus || "READY_WITH_MANUAL_CHECKS") : "FAIL",
      evidence: restoreReadiness.ok ? {
        restore_readiness_status: restoreStatus,
        restore_execution_enabled: restoreReadiness.result?.restore_policy?.restore_execution_enabled,
        latest_restorable_backup_exists: restoreReadiness.result?.latest_restorable_backup?.exists
      } : { error: restoreReadiness.error }
    }),
    buildCheck({
      key: "system_monitoring_available",
      group: "monitoring",
      label: "System Monitoring Dashboard can be loaded.",
      raw_status: systemMonitoring.ok ? systemStatus : "FAIL",
      evidence: systemMonitoring.ok ? {
        monitoring_status: systemStatus,
        db_ok: systemMonitoring.result?.db?.ok,
        queue_failed: systemMonitoring.result?.queue?.failed,
        operation_error_24h: systemMonitoring.result?.operation_logs?.error_24h
      } : { error: systemMonitoring.error }
    }),
    buildCheck({
      key: "resource_monitoring_available",
      group: "monitoring",
      label: "Detailed Resource Monitoring can be loaded.",
      raw_status: resourceMonitoring.ok ? resourceStatus : "FAIL",
      evidence: resourceMonitoring.ok ? {
        monitoring_status: resourceStatus,
        disk_free_percent: resourceMonitoring.result?.disk?.free_percent,
        db_latency_ms: resourceMonitoring.result?.db?.latency_ms,
        stuck_processing_count: resourceMonitoring.result?.queue?.stuck_processing_count
      } : { error: resourceMonitoring.error }
    }),
    buildCheck({
      key: "worker_status_available",
      group: "monitoring",
      label: "Worker status and recommended worker commands can be loaded.",
      raw_status: workerStatus.ok ? "GOOD" : "FAIL",
      evidence: workerStatus.ok ? {
        api_server: workerStatus.result?.worker?.workers?.api_server?.status || workerStatus.result?.workers?.api_server?.status,
        summary_worker: workerStatus.result?.worker?.workers?.summary_worker?.status || workerStatus.result?.workers?.summary_worker?.status,
        daily_operation_worker: workerStatus.result?.worker?.workers?.daily_operation_worker?.status || workerStatus.result?.workers?.daily_operation_worker?.status
      } : { error: workerStatus.error }
    }),
    buildCheck({
      key: "alert_rules_available",
      group: "alerts",
      label: "Alert Rules evaluation can be loaded and operator actions are available.",
      raw_status: alertStatus.ok ? alertRuleStatus : "FAIL",
      evidence: alertStatus.ok ? {
        alert_status: alertRuleStatus,
        alert_count: alertStatus.result?.evaluation?.alert_count,
        critical_count: alertStatus.result?.evaluation?.critical_count,
        warning_count: alertStatus.result?.evaluation?.warning_count
      } : { error: alertStatus.error }
    }),
    buildCheck({
      key: "provider_router_available",
      group: "ai_pipeline",
      label: "Provider Router status and mock route selection are available.",
      raw_status: routerStatus.ok && routerSelection.ok && ["SELECTED", "SELECTED_WITH_WARNINGS"].includes(routerRouteStatus) ? "GOOD" : "FAIL",
      evidence: {
        router_status_loaded: routerStatus.ok,
        route_status: routerRouteStatus,
        selected_provider: routerSelection.result?.selected_provider || routerSelection.result?.route?.selected_provider,
        selected_model: routerSelection.result?.selected_model || routerSelection.result?.route?.selected_model
      }
    })
  ];

  if (runResponseSmokeTest) {
    checklist.push(buildCheck({
      key: "ai_response_mock_smoke_test",
      group: "ai_pipeline",
      label: "AI Response Test can run through Provider Router using mock provider without saving memory.",
      raw_status: responseSmoke?.ok && responseSmoke.result?.ok !== false ? "GOOD" : "FAIL",
      evidence: responseSmoke?.ok ? {
        response_status: responseSmoke.result?.response_status,
        selected_provider: responseSmoke.result?.selected_model?.provider,
        stored: responseSmoke.result?.stored
      } : { error: responseSmoke?.error || "Smoke test was not run." }
    }));
  } else {
    checklist.push(buildCheck({
      key: "ai_response_mock_smoke_test",
      group: "ai_pipeline",
      label: "Optional AI Response Test smoke test is available but was skipped in this run.",
      raw_status: "WARNING",
      required: false,
      evidence: { run_response_smoke_test: false },
      operator_action: "Run with run_response_smoke_test=true before final launch if you want an end-to-end pipeline smoke test."
    }));
  }

  const summary = summarizeChecklist(checklist);
  const blocking_items = checklist.filter((item) => item.required !== false && item.status === "FAIL");
  const warning_items = checklist.filter((item) => item.status === "WARNING");
  const manual_check_items = warning_items.filter((item) => item.required === false || ["backup_history_available", "ai_response_mock_smoke_test"].includes(item.key));

  const decision_status = blocking_items.length
    ? "NOT_READY"
    : warning_items.length
      ? "READY_WITH_WARNINGS"
      : "READY_FOR_PHASE_14_2";

  return {
    ok: blocking_items.length === 0,
    phase: "14-1",
    checked_at: new Date().toISOString(),
    smoke_status: blocking_items.length ? "ERROR" : warning_items.length ? "WARNING" : "GOOD",
    decision_status,
    phase14_2_entry_allowed: blocking_items.length === 0,
    completion_percent: summary.completion_percent,
    summary,
    checklist,
    blocking_items,
    warning_items,
    manual_check_items,
    data_sources: {
      phase13_final: phase13Final.result || phase13Final,
      admin_security: adminSecurity.result || adminSecurity,
      backup_status: backupStatus.result || backupStatus,
      backup_history: backupHistory.result || backupHistory,
      restore_readiness: restoreReadiness.result || restoreReadiness,
      system_monitoring: systemMonitoring.result || systemMonitoring,
      resource_monitoring: resourceMonitoring.result || resourceMonitoring,
      worker_status: workerStatus.result || workerStatus,
      alert_status: alertStatus.result || alertStatus,
      provider_router_status: routerStatus.result || routerStatus,
      provider_router_selection: routerSelection.result || routerSelection,
      ai_response_smoke: responseSmoke ? (responseSmoke.result || responseSmoke) : null
    },
    recommended_next_actions: blocking_items.length
      ? blocking_items.map((item) => item.operator_action || `Resolve ${item.label}`)
      : warning_items.length
        ? warning_items.map((item) => item.operator_action || `Review ${item.label}`)
        : ["Proceed to Phase 14-2 Production Admin Menu Cleanup."],
    next_phase: blocking_items.length ? "Resolve smoke test blocking items" : "Phase 14-2: Production Admin Menu Cleanup"
  };
}

async function getPhase14SmokeStatus() {
  return buildPhase14SmokeChecklist({ run_response_smoke_test: false });
}

async function getPhase14SmokeChecklist() {
  const result = await buildPhase14SmokeChecklist({ run_response_smoke_test: false });
  return {
    ok: result.ok,
    phase: result.phase,
    checked_at: result.checked_at,
    smoke_status: result.smoke_status,
    decision_status: result.decision_status,
    phase14_2_entry_allowed: result.phase14_2_entry_allowed,
    completion_percent: result.completion_percent,
    summary: result.summary,
    checklist: result.checklist,
    blocking_items: result.blocking_items,
    warning_items: result.warning_items,
    manual_check_items: result.manual_check_items,
    recommended_next_actions: result.recommended_next_actions
  };
}

async function runPhase14SmokeTest(options = {}) {
  return buildPhase14SmokeChecklist({
    ...options,
    run_response_smoke_test: options.run_response_smoke_test === true
  });
}

module.exports = {
  getPhase14SmokeStatus,
  getPhase14SmokeChecklist,
  runPhase14SmokeTest
};
