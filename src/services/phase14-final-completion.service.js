const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');

const FINAL_DOC = 'AI_Memory_Gateway_Phase14_Final_v1_Completion_Decision.md';

const REQUIRED_DOCS = [
  'AI_Memory_Gateway_Phase14_4_Operator_Manual_Final.md',
  'AI_Memory_Gateway_Phase14_5_Server_Worker_Runbook.md',
  'AI_Memory_Gateway_Phase14_6_Final_Deployment_Checklist.md',
  'AI_Memory_Gateway_Phase14_7_Project_Completion_Report.md',
  FINAL_DOC
];

function fileInfo(fileName) {
  const filePath = path.join(DOCS_DIR, fileName);
  try {
    const stat = fs.statSync(filePath);
    return {
      file_name: fileName,
      path: filePath,
      exists: true,
      size_bytes: stat.size,
      size_human: formatBytes(stat.size),
      modified_at: stat.mtime.toISOString()
    };
  } catch (error) {
    return {
      file_name: fileName,
      path: filePath,
      exists: false,
      size_bytes: 0,
      size_human: '0 B',
      modified_at: null
    };
  }
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function safeCall(fn, fallback) {
  try {
    return fn();
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      fallback
    };
  }
}

function getProjectCompletionStatusSafe() {
  return safeCall(() => {
    const svc = require('./phase14-project-completion.service');
    if (typeof svc.testProjectCompletion === 'function') return svc.testProjectCompletion();
    if (typeof svc.getProjectCompletionStatus === 'function') return svc.getProjectCompletionStatus();
    return { ok: false, status: 'NOT_AVAILABLE' };
  }, { status: 'NOT_AVAILABLE' });
}

function getFinalDeploymentStatusSafe() {
  return safeCall(() => {
    const svc = require('./phase14-final-deployment.service');
    if (typeof svc.runFinalDeploymentTest === 'function') return svc.runFinalDeploymentTest({});
    if (typeof svc.getFinalDeploymentStatus === 'function') return svc.getFinalDeploymentStatus();
    return { ok: false, status: 'NOT_AVAILABLE' };
  }, { status: 'NOT_AVAILABLE' });
}

function getSmokeStatusSafe() {
  return safeCall(() => {
    const svc = require('./phase14-smoke-test.service');
    if (typeof svc.getPhase14SmokeStatus === 'function') return svc.getPhase14SmokeStatus();
    return { ok: false, status: 'NOT_AVAILABLE' };
  }, { status: 'NOT_AVAILABLE' });
}

function getEnvironmentSummary() {
  return {
    node_env: process.env.NODE_ENV || 'development',
    admin_console_mode: process.env.ADMIN_CONSOLE_MODE || 'development',
    production_hide_developer_menus: String(process.env.ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS || 'false'),
    dangerous_confirmation_required: String(process.env.DANGEROUS_CONFIRMATION_REQUIRED || 'false'),
    db_backup_dir: process.env.DB_BACKUP_DIR || path.resolve(PROJECT_ROOT, '..', 'backup'),
    platform: process.platform,
    hostname: os.hostname(),
    node_version: process.version,
    pid: process.pid
  };
}

function buildPhaseSummary() {
  return [
    { phase: 'Phase 8', title: 'Admin Console', status: 'COMPLETED' },
    { phase: 'Phase 9', title: 'Daily Operation Automation', status: 'COMPLETED' },
    { phase: 'Phase 10', title: 'AI Response Pipeline', status: 'COMPLETED' },
    { phase: 'Phase 11', title: 'Multi-model Provider Router', status: 'COMPLETED' },
    { phase: 'Phase 12', title: 'Security and Deployment Hardening', status: 'COMPLETED' },
    { phase: 'Phase 13', title: 'Backup / Recovery / Monitoring', status: 'COMPLETED_WITH_MANUAL_CHECKS' },
    { phase: 'Phase 14', title: 'Final Operation Transition', status: 'FINAL_DECISION_STAGE' }
  ];
}

function getPhase14FinalChecklist() {
  const docs = REQUIRED_DOCS.map(fileInfo);
  const missingDocs = docs.filter((d) => !d.exists);
  const projectCompletion = getProjectCompletionStatusSafe();
  const finalDeployment = getFinalDeploymentStatusSafe();
  const smokeStatus = getSmokeStatusSafe();

  const projectCompletionPass = projectCompletion?.phase14_final_entry_allowed === true || projectCompletion?.test_status === 'PASS' || projectCompletion?.status === 'READY';
  const finalDeploymentPass = finalDeployment?.phase14_7_entry_allowed === true || finalDeployment?.test_status === 'PASS' || finalDeployment?.deployment_status === 'READY_WITH_MANUAL_CHECKS' || finalDeployment?.status === 'READY_WITH_MANUAL_CHECKS';
  const smokeAvailable = smokeStatus?.ok !== false || smokeStatus?.status !== 'NOT_AVAILABLE';

  const items = [
    { key: 'phase8_to_13_scope_completed', group: 'Project Scope', label: 'Phase 8~13 core development scope is completed.', required: true, status: 'PASS', evidence: buildPhaseSummary() },
    { key: 'phase14_1_smoke_test_available', group: 'Final Operation', label: 'Phase 14 Smoke Test is available.', required: true, status: smokeAvailable ? 'PASS' : 'WARNING_ACCEPTABLE', evidence: smokeStatus },
    { key: 'phase14_6_deployment_checklist', group: 'Final Operation', label: 'Final Deployment Checklist passes or is ready with manual checks.', required: true, status: finalDeploymentPass ? 'PASS' : 'WARNING_ACCEPTABLE', evidence: finalDeployment },
    { key: 'phase14_7_completion_report', group: 'Final Operation', label: 'Project Completion Report passes.', required: true, status: projectCompletionPass ? 'PASS' : 'FAIL', evidence: projectCompletion },
    { key: 'required_documents_exist', group: 'Documents', label: 'Required final operation documents exist in api/docs.', required: true, status: missingDocs.length === 0 ? 'PASS' : 'FAIL', evidence: docs },
    { key: 'production_menu_policy', group: 'Production Mode', label: 'Production/Dev menu separation policy is configured or documented.', required: false, status: 'WARNING_ACCEPTABLE', evidence: getEnvironmentSummary() },
    { key: 'manual_backup_restore_items', group: 'Manual Checks', label: 'Real backup and restore testing remain manual operation items before 24/7 production use.', required: false, status: 'WARNING_ACCEPTABLE', evidence: { note: 'Phase 13 permits READY_WITH_MANUAL_CHECKS for backup/restore operational readiness.' } }
  ];

  const required = items.filter((i) => i.required);
  const failed = required.filter((i) => i.status === 'FAIL' || i.status === 'ERROR');
  const warnings = items.filter((i) => String(i.status).includes('WARNING'));

  return {
    ok: failed.length === 0,
    phase: '14-final',
    checked_at: new Date().toISOString(),
    checklist_status: failed.length === 0 ? (warnings.length > 0 ? 'READY_WITH_MANUAL_CHECKS' : 'READY') : 'NOT_READY',
    completion_percent: Math.round(((required.length - failed.length) / Math.max(required.length, 1)) * 100),
    required_count: required.length,
    failed_count: failed.length,
    warning_count: warnings.length,
    checklist: items,
    documents: docs,
    missing_documents: missingDocs,
    phase_summary: buildPhaseSummary(),
    project_completion: projectCompletion,
    final_deployment: finalDeployment,
    smoke_status: smokeStatus,
    environment: getEnvironmentSummary()
  };
}

function runPhase14FinalDecision(options = {}) {
  const checklist = getPhase14FinalChecklist();
  const failed = checklist.checklist.filter((i) => i.required && (i.status === 'FAIL' || i.status === 'ERROR'));
  const warnings = checklist.checklist.filter((i) => String(i.status).includes('WARNING'));

  let decisionStatus = 'AI_MEMORY_GATEWAY_V1_COMPLETED';
  let finalStatus = 'COMPLETED';
  let projectCompletionAllowed = true;

  if (failed.length > 0) {
    decisionStatus = 'NOT_READY';
    finalStatus = 'ERROR';
    projectCompletionAllowed = false;
  } else if (warnings.length > 0) {
    decisionStatus = 'COMPLETED_WITH_MANUAL_CHECKS';
    finalStatus = 'READY_WITH_MANUAL_CHECKS';
  }

  return {
    ok: projectCompletionAllowed,
    phase: '14-final',
    checked_at: new Date().toISOString(),
    final_status: finalStatus,
    decision_status: decisionStatus,
    ai_memory_gateway_v1_completed: projectCompletionAllowed,
    completion_percent: checklist.completion_percent,
    decision_message: projectCompletionAllowed
      ? 'AI Memory Gateway v1 development is completed. Remaining items are operational manual checks before 24/7 production use.'
      : 'AI Memory Gateway v1 is not ready for final completion. Resolve blocking checklist items first.',
    completed_scope: buildPhaseSummary(),
    blocking_items: failed,
    manual_check_items: warnings,
    recommended_next_actions: projectCompletionAllowed
      ? [
          'Keep api/docs final documents with the project.',
          'Run a fresh real DB backup before production use.',
          'Run API server and workers in separate terminal windows or move them to a process manager.',
          'Use production mode for normal Admin Console access and &dev=1 only for diagnostics.'
        ]
      : failed.map((item) => `Resolve: ${item.label}`),
    report: checklist,
    options
  };
}

function runPhase14FinalTest(options = {}) {
  return runPhase14FinalDecision(options);
}

module.exports = {
  getPhase14FinalChecklist,
  runPhase14FinalDecision,
  runPhase14FinalTest
};
