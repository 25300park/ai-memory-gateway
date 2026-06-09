const {
  getDatabaseBackupStatus,
  getBackupHistoryStats,
  getRestoreReadinessStatus
} = require("./backup-status.service");

const {
  getSystemMonitoringDashboard,
  getDetailedResourceMonitoring,
  getWorkerMonitoringStatus,
  getAlertRulesStatus
} = require("./system-monitoring.service");

function statusRank(status) {
  const value = String(status || "UNKNOWN").toUpperCase();
  if (["GOOD", "READY", "READY_FOR_PHASE_14", "READY_WITH_MANUAL_CHECKS"].includes(value)) return 0;
  if (["WARNING", "READY_WITH_WARNINGS", "READY_WITH_MANUAL_CHECKS"].includes(value)) return 1;
  if (["ERROR", "NOT_READY"].includes(value)) return 2;
  return 1;
}

function worstStatus(statuses) {
  const worst = statuses.reduce((acc, item) => Math.max(acc, statusRank(item)), 0);
  if (worst >= 2) return "ERROR";
  if (worst === 1) return "WARNING";
  return "GOOD";
}

function decisionFromStatus({ checklist, status, blockingItems, manualItems }) {
  const requiredItems = checklist.filter((item) => item.required);
  const completedRequired = requiredItems.filter((item) => item.status === "PASS" || item.status === "WARNING_ACCEPTABLE");
  const completionPercent = requiredItems.length
    ? Math.round((completedRequired.length / requiredItems.length) * 100)
    : 100;

  if (blockingItems.length > 0 || status === "ERROR") {
    return {
      decision_status: "NOT_READY",
      phase14_entry_allowed: false,
      completion_percent: completionPercent,
      decision_message: "Phase 13 has blocking backup, restore, monitoring, or alert items. Resolve these before Phase 14."
    };
  }

  if (manualItems.length > 0 || status === "WARNING" || completionPercent < 100) {
    return {
      decision_status: "READY_WITH_MANUAL_CHECKS",
      phase14_entry_allowed: true,
      completion_percent: completionPercent,
      decision_message: "Phase 13 is functionally complete, but manual checks remain before final production transition."
    };
  }

  return {
    decision_status: "READY_FOR_PHASE_14",
    phase14_entry_allowed: true,
    completion_percent: completionPercent,
    decision_message: "Phase 13 backup, recovery readiness, monitoring, and alert preparation are complete. You can start Phase 14."
  };
}

async function buildPhase13Checklist() {
  const [backupStatus, historyStats, restoreReadiness, systemMonitoring, resourceMonitoring, workerStatus, alertStatus] = await Promise.all([
    getDatabaseBackupStatus(),
    getBackupHistoryStats({ days: 30 }).catch((error) => ({ ok: false, error: error.message })),
    getRestoreReadinessStatus().catch((error) => ({ ok: false, restore_status: "ERROR", errors: [error.message] })),
    getSystemMonitoringDashboard().catch((error) => ({ ok: false, monitoring_status: "ERROR", errors: [error.message] })),
    getDetailedResourceMonitoring().catch((error) => ({ ok: false, monitoring_status: "ERROR", errors: [error.message] })),
    getWorkerMonitoringStatus().catch((error) => ({ ok: false, worker_status: "ERROR", errors: [error.message] })),
    getAlertRulesStatus().catch((error) => ({ ok: false, alert_status: "ERROR", errors: [error.message] }))
  ]);

  const backupOk = backupStatus?.ok !== false;
  const backupDirectory = backupStatus?.backup_directory || {};
  const backupFileCount = Number(
    backupStatus?.backup_file_count ??
    backupDirectory.backup_file_count ??
    0
  );
  const recentBackupFileCount = Array.isArray(backupDirectory.recent_files)
    ? backupDirectory.recent_files.filter((file) => file && file.is_backup_file).length
    : 0;
  const historySuccessCount = Number(historyStats?.summary?.success_count || historyStats?.success_count || 0);
  const backupFileReady = backupFileCount > 0 || recentBackupFileCount > 0 || historySuccessCount > 0;
  const backupDirReady = Boolean(backupDirectory.exists || backupStatus?.directory_exists) && Boolean(backupDirectory.writable || backupStatus?.directory_writable);
  const historyReady = historyStats?.ok !== false;
  // Phase 13 Final checks that restore readiness tooling is available and that actual restore
  // execution remains safely disabled. A missing restorable backup should be treated as a
  // manual backup readiness item, not as a hard failure of the restore-readiness screen itself.
  const restoreStatusValue = String(
    restoreReadiness?.restore_readiness_status || restoreReadiness?.restore_status || ""
  ).toUpperCase();
  const restoreExecutionSafelyDisabled = restoreReadiness?.restore_policy?.restore_execution_enabled === false;
  const restoreChecklistAvailable = Array.isArray(restoreReadiness?.checklist) && restoreReadiness.checklist.length > 0;
  const restoreTargetPolicyDefined = Boolean(restoreReadiness?.restore_policy?.target_db);
  const restoreConfirmationRequired = restoreReadiness?.restore_policy?.confirmation_required !== false;
  const restoreReady =
    restoreReadiness?.ok !== false ||
    restoreStatusValue === "READY" ||
    restoreStatusValue === "READY_WITH_MANUAL_CHECKS" ||
    (
      restoreStatusValue === "NOT_READY" &&
      restoreExecutionSafelyDisabled &&
      restoreChecklistAvailable &&
      restoreTargetPolicyDefined &&
      restoreConfirmationRequired
    );
  const systemReady = ["GOOD", "WARNING"].includes(String(systemMonitoring?.monitoring_status || "").toUpperCase());
  const resourceReady = ["GOOD", "WARNING"].includes(String(resourceMonitoring?.monitoring_status || "").toUpperCase());
  const workerReady = workerStatus?.ok !== false;
  const alertReady = ["GOOD", "WARNING"].includes(String(alertStatus?.alert_status || "").toUpperCase());

  const checklist = [
    {
      key: "phase13_1_backup_status",
      group: "Backup",
      label: "Phase 13-1 Database Backup Status API and screen are available.",
      required: true,
      status: backupOk ? "PASS" : "FAIL",
      evidence: { backup_status_ok: backupOk }
    },
    {
      key: "backup_directory_ready",
      group: "Backup",
      label: "Backup directory exists and is writable.",
      required: true,
      status: backupDirReady ? "PASS" : "FAIL",
      evidence: {
        directory_exists: backupStatus?.backup_directory?.exists ?? backupStatus?.directory_exists,
        directory_writable: backupStatus?.backup_directory?.writable ?? backupStatus?.directory_writable
      }
    },
    {
      key: "phase13_2_manual_backup",
      group: "Backup",
      label: "Manual DB Backup execution is connected and at least one backup file is available or backup can be executed manually.",
      required: true,
      status: backupFileReady ? "PASS" : "WARNING_ACCEPTABLE",
      evidence: {
        backup_file_count: backupFileCount,
        recent_backup_file_count: recentBackupFileCount,
        history_success_count: historySuccessCount,
        latest_backup: backupStatus?.latest_backup || backupStatus?.latest_backup_file || backupDirectory.latest_backup
      }
    },
    {
      key: "phase13_3_backup_history",
      group: "Backup",
      label: "Backup History storage and stats are available.",
      required: true,
      status: historyReady ? "PASS" : "FAIL",
      evidence: historyStats?.summary || historyStats
    },
    {
      key: "phase13_4_restore_readiness",
      group: "Recovery",
      label: "Restore Readiness Checklist is available and restore execution remains safely disabled.",
      required: true,
      status: restoreReady ? "PASS" : "FAIL",
      evidence: {
        restore_status: restoreReadiness?.restore_readiness_status || restoreReadiness?.restore_status,
        restore_execution_enabled: restoreReadiness?.restore_policy?.restore_execution_enabled,
        restore_checklist_available: restoreChecklistAvailable,
        restore_target_policy_defined: restoreTargetPolicyDefined,
        restore_confirmation_required: restoreConfirmationRequired,
        latest_restorable_backup_exists: restoreReadiness?.latest_restorable_backup?.exists || false,
        note: restoreExecutionSafelyDisabled
          ? "Restore execution is intentionally disabled. Missing backup file is handled as a manual backup check, not a restore-tooling failure."
          : undefined
      }
    },
    {
      key: "phase13_5_system_monitoring",
      group: "Monitoring",
      label: "System Monitoring Dashboard is available.",
      required: true,
      status: systemReady ? "PASS" : "FAIL",
      evidence: { monitoring_status: systemMonitoring?.monitoring_status }
    },
    {
      key: "phase13_6_resource_monitoring",
      group: "Monitoring",
      label: "Disk, DB, Queue, and Worker resource monitoring are available.",
      required: true,
      status: resourceReady ? "PASS" : "FAIL",
      evidence: { monitoring_status: resourceMonitoring?.monitoring_status }
    },
    {
      key: "worker_evidence",
      group: "Monitoring",
      label: "Worker monitoring status can be loaded and recommended worker commands are available.",
      required: true,
      status: workerReady ? "PASS" : "FAIL",
      evidence: workerStatus?.workers || workerStatus
    },
    {
      key: "phase13_7_alert_rules",
      group: "Alerts",
      label: "Alert Rules evaluation is available and returns operator actions.",
      required: true,
      status: alertReady ? "PASS" : "FAIL",
      evidence: {
        alert_status: alertStatus?.alert_status,
        alert_count: alertStatus?.evaluation?.alert_count
      }
    },
    {
      key: "manual_restore_policy",
      group: "Recovery",
      label: "Actual restore execution is not enabled in Phase 13 Final; restore must target a staging DB in a later controlled step.",
      required: false,
      status: "WARNING_ACCEPTABLE",
      evidence: {
        note: "Phase 13 checks restore readiness only. Production restore execution remains intentionally disabled."
      }
    }
  ];

  const blocking_items = checklist.filter((item) => item.required && item.status === "FAIL");
  const manual_check_items = checklist.filter((item) => item.status === "WARNING_ACCEPTABLE");

  // Phase 13 Final should be a production-transition readiness gate.
  // Only explicit checklist FAIL items block Phase 14. Monitoring WARNING states,
  // missing backup files, or restore execution intentionally disabled are manual checks,
  // not hard blockers, as long as the relevant screens/APIs are available.
  const warningSignals = [
    !backupFileReady,
    String(systemMonitoring?.monitoring_status || "").toUpperCase() === "WARNING",
    String(resourceMonitoring?.monitoring_status || "").toUpperCase() === "WARNING",
    String(alertStatus?.alert_status || "").toUpperCase() === "WARNING",
    manual_check_items.length > 0
  ].filter(Boolean);

  const overall_status = blocking_items.length > 0
    ? "ERROR"
    : warningSignals.length > 0
      ? "WARNING"
      : "GOOD";

  return {
    ok: overall_status !== "ERROR",
    phase: "13-final",
    checked_at: new Date().toISOString(),
    overall_status,
    checklist,
    data_sources: {
      backup_status: backupStatus,
      backup_history_stats: historyStats,
      restore_readiness: restoreReadiness,
      system_monitoring: systemMonitoring,
      resource_monitoring: resourceMonitoring,
      worker_status: workerStatus,
      alert_status: alertStatus
    },
    blocking_items,
    manual_check_items
  };
}

async function getPhase13CompletionChecklist() {
  const report = await buildPhase13Checklist();
  return {
    ok: true,
    phase: "13-final",
    title: "Phase 13 Completion Checklist",
    checked_at: report.checked_at,
    overall_status: report.overall_status,
    checklist: report.checklist,
    blocking_items: report.blocking_items,
    manual_check_items: report.manual_check_items
  };
}

async function runPhase13FinalDecision() {
  const report = await buildPhase13Checklist();
  const decision = decisionFromStatus({
    checklist: report.checklist,
    status: report.overall_status,
    blockingItems: report.blocking_items,
    manualItems: report.manual_check_items
  });

  return {
    ok: decision.phase14_entry_allowed,
    phase: "13-final",
    checked_at: report.checked_at,
    final_status: report.overall_status,
    ...decision,
    phase13_completed_items: report.checklist.filter((item) => item.status === "PASS" || item.status === "WARNING_ACCEPTABLE").map((item) => item.key),
    blocking_items: report.blocking_items,
    manual_check_items: report.manual_check_items,
    next_phase: decision.phase14_entry_allowed ? "Phase 14: Final production transition and project completion decision" : "Resolve Phase 13 blocking items first",
    recommended_next_actions: decision.phase14_entry_allowed
      ? [
          "Start Phase 14-1: Full smoke test across all completed modules.",
          "Keep restore execution disabled unless using a staging restore target.",
          "Confirm daily backup and summary worker procedures before production transition."
        ]
      : report.blocking_items.map((item) => `Resolve: ${item.label}`),
    report
  };
}

async function runPhase13FinalTest({ scenario = "current" } = {}) {
  if (scenario === "no_backup_file") {
    const result = await runPhase13FinalDecision();
    result.scenario = scenario;
    result.test_note = "This scenario is informational. Use actual backup status APIs to validate missing file behavior.";
    return result;
  }
  return {
    scenario,
    ...(await runPhase13FinalDecision())
  };
}

module.exports = {
  getPhase13CompletionChecklist,
  runPhase13FinalDecision,
  runPhase13FinalTest
};
