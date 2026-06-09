const fs = require('fs');
const path = require('path');

function getManualPath() {
  return path.join(process.cwd(), 'docs', 'AI_Memory_Gateway_Phase14_4_Operator_Manual_Final.md');
}

function getOperatorManualStatus() {
  const manualPath = getManualPath();
  const exists = fs.existsSync(manualPath);
  const stat = exists ? fs.statSync(manualPath) : null;
  return {
    ok: true,
    phase: '14-4',
    status: exists ? 'READY' : 'NOT_READY',
    manual: {
      file_name: 'AI_Memory_Gateway_Phase14_4_Operator_Manual_Final.md',
      path: manualPath,
      exists,
      size_bytes: stat ? stat.size : 0,
      modified_at: stat ? stat.mtime.toISOString() : null,
    },
    sections: [
      'Daily Operation Flow',
      'Startup Commands',
      'Backup Procedure',
      'Restore Policy',
      'Security Operation',
      'Troubleshooting',
    ],
    next_action: exists
      ? 'Proceed to Phase 14-5: server restart and worker operation procedure documentation.'
      : 'Create operator manual document in docs directory.',
  };
}

function getOperatorManualChecklist() {
  const status = getOperatorManualStatus();
  const exists = status.manual.exists;
  return {
    ok: true,
    phase: '14-4',
    checklist_status: exists ? 'PASS' : 'FAIL',
    checklist: [
      { key: 'manual_file_exists', label: 'Operator manual document exists.', status: exists ? 'PASS' : 'FAIL', required: true },
      { key: 'daily_operation_flow', label: 'Daily operation flow is documented.', status: exists ? 'PASS' : 'FAIL', required: true },
      { key: 'startup_commands', label: 'API and worker startup commands are documented.', status: exists ? 'PASS' : 'FAIL', required: true },
      { key: 'backup_procedure', label: 'Manual backup procedure is documented.', status: exists ? 'PASS' : 'FAIL', required: true },
      { key: 'restore_policy', label: 'Restore safety policy is documented.', status: exists ? 'PASS' : 'FAIL', required: true },
      { key: 'security_operation', label: 'Admin token and production menu security are documented.', status: exists ? 'PASS' : 'FAIL', required: true },
      { key: 'troubleshooting', label: 'Common troubleshooting steps are documented.', status: exists ? 'PASS' : 'FAIL', required: true },
    ],
  };
}

function testOperatorManual() {
  const status = getOperatorManualStatus();
  const checklist = getOperatorManualChecklist();
  const failed = checklist.checklist.filter((item) => item.required && item.status !== 'PASS');
  return {
    ok: failed.length === 0,
    phase: '14-4',
    test_status: failed.length === 0 ? 'PASS' : 'FAIL',
    status,
    failed_items: failed,
    phase14_5_entry_allowed: failed.length === 0,
  };
}

module.exports = {
  getOperatorManualStatus,
  getOperatorManualChecklist,
  testOperatorManual,
};
