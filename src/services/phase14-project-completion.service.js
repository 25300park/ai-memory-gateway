const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '../../docs');
const COMPLETION_REPORT_FILE = 'AI_Memory_Gateway_Phase14_7_Project_Completion_Report.md';

function fileInfo(fileName) {
  const filePath = path.join(DOCS_DIR, fileName);
  try {
    const stat = fs.statSync(filePath);
    return {
      file_name: fileName,
      path: filePath,
      exists: true,
      size_bytes: stat.size,
      modified_at: stat.mtime,
    };
  } catch (error) {
    return {
      file_name: fileName,
      path: filePath,
      exists: false,
      size_bytes: 0,
      modified_at: null,
    };
  }
}

function getCompletedPhaseSummary() {
  return [
    { phase: 'Phase 8', title: 'Admin Console Development', status: 'COMPLETED' },
    { phase: 'Phase 9', title: 'Admin Console Stabilization + Daily Operation Automation', status: 'COMPLETED' },
    { phase: 'Phase 10', title: 'Memory Context + AI Response Pipeline', status: 'COMPLETED' },
    { phase: 'Phase 11', title: 'Multi-model Providers + Router + Fallback', status: 'COMPLETED' },
    { phase: 'Phase 12', title: 'Security + Deployment Hardening', status: 'COMPLETED' },
    { phase: 'Phase 13', title: 'Backup / Recovery / Monitoring Automation', status: 'COMPLETED_WITH_MANUAL_CHECKS' },
    { phase: 'Phase 14-1', title: 'Final Smoke Test', status: 'COMPLETED' },
    { phase: 'Phase 14-2', title: 'Production Admin Menu Cleanup', status: 'COMPLETED' },
    { phase: 'Phase 14-3', title: 'Dev / Diagnostic Menu Final Hide', status: 'COMPLETED' },
    { phase: 'Phase 14-4', title: 'Operator Manual Final', status: 'COMPLETED' },
    { phase: 'Phase 14-5', title: 'Server & Worker Runbook', status: 'COMPLETED' },
    { phase: 'Phase 14-6', title: 'Final Deployment Checklist', status: 'COMPLETED' },
    { phase: 'Phase 14-7', title: 'Project Completion Report', status: 'IN_PROGRESS' },
  ];
}

function getRequiredDocuments() {
  const docs = [
    'AI_Memory_Gateway_Phase14_4_Operator_Manual_Final.md',
    'AI_Memory_Gateway_Phase14_5_Server_Worker_Runbook.md',
    'AI_Memory_Gateway_Phase14_6_Final_Deployment_Checklist.md',
    COMPLETION_REPORT_FILE,
  ];
  return docs.map(fileInfo);
}

function buildChecklist() {
  const docs = getRequiredDocuments();
  const completionReport = docs.find((doc) => doc.file_name === COMPLETION_REPORT_FILE);
  const allDocsExist = docs.every((doc) => doc.exists && doc.size_bytes > 0);

  return [
    {
      key: 'phase_summary_documented',
      group: 'Completion Report',
      label: 'Phase 8 through Phase 14 completion scope is documented.',
      required: true,
      status: completionReport?.exists ? 'PASS' : 'FAIL',
    },
    {
      key: 'operator_manual_exists',
      group: 'Documentation',
      label: 'Operator Manual document exists in api/docs.',
      required: true,
      status: docs.find((doc) => doc.file_name.includes('Phase14_4'))?.exists ? 'PASS' : 'FAIL',
    },
    {
      key: 'runbook_exists',
      group: 'Documentation',
      label: 'Server & Worker Runbook document exists in api/docs.',
      required: true,
      status: docs.find((doc) => doc.file_name.includes('Phase14_5'))?.exists ? 'PASS' : 'FAIL',
    },
    {
      key: 'deployment_checklist_exists',
      group: 'Documentation',
      label: 'Final Deployment Checklist document exists in api/docs.',
      required: true,
      status: docs.find((doc) => doc.file_name.includes('Phase14_6'))?.exists ? 'PASS' : 'FAIL',
    },
    {
      key: 'all_required_docs_exist',
      group: 'Documentation',
      label: 'All required final documents exist and are non-empty.',
      required: true,
      status: allDocsExist ? 'PASS' : 'FAIL',
    },
    {
      key: 'phase14_final_ready',
      group: 'Next Step',
      label: 'Project is ready for Phase 14 Final completion decision after this report is confirmed.',
      required: true,
      status: allDocsExist ? 'PASS' : 'FAIL',
    },
  ];
}

function getProjectCompletionStatus() {
  const checkedAt = new Date().toISOString();
  const documents = getRequiredDocuments();
  const checklist = buildChecklist();
  const failed = checklist.filter((item) => item.required && item.status !== 'PASS');
  const warningItems = checklist.filter((item) => item.status === 'WARNING' || item.status === 'WARNING_ACCEPTABLE');
  const projectStatus = failed.length === 0 ? 'READY_FOR_PHASE_14_FINAL' : 'NOT_READY';

  return {
    ok: failed.length === 0,
    phase: '14-7',
    checked_at: checkedAt,
    status: projectStatus,
    phase14_final_entry_allowed: failed.length === 0,
    summary: {
      completed_phase_count: getCompletedPhaseSummary().length - 1,
      required_items: checklist.filter((item) => item.required).length,
      failed_items: failed.length,
      warning_items: warningItems.length,
      document_count: documents.length,
      missing_document_count: documents.filter((doc) => !doc.exists || doc.size_bytes <= 0).length,
    },
    completed_phases: getCompletedPhaseSummary(),
    documents,
    checklist,
    failed_items: failed,
    warnings: warningItems,
    next_action: failed.length === 0
      ? 'Proceed to Phase 14 Final: AI Memory Gateway v1 development completion decision.'
      : 'Create or copy missing final documentation files into api/docs first.',
  };
}

function getProjectCompletionChecklist() {
  const status = getProjectCompletionStatus();
  return {
    ok: true,
    phase: '14-7',
    checked_at: new Date().toISOString(),
    status: status.status,
    checklist: status.checklist,
    documents: status.documents,
    completed_phases: status.completed_phases,
  };
}

function testProjectCompletion() {
  const status = getProjectCompletionStatus();
  return {
    ok: status.phase14_final_entry_allowed,
    phase: '14-7',
    test_status: status.phase14_final_entry_allowed ? 'PASS' : 'FAIL',
    phase14_final_entry_allowed: status.phase14_final_entry_allowed,
    status,
    failed_items: status.failed_items,
  };
}

module.exports = {
  getProjectCompletionStatus,
  getProjectCompletionChecklist,
  testProjectCompletion,
};
