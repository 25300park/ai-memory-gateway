const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');
const RUNBOOK_FILE = 'AI_Memory_Gateway_Phase14_5_Server_Worker_Runbook.md';
const RUNBOOK_PATH = path.join(DOCS_DIR, RUNBOOK_FILE);

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function getFileInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      path: filePath,
      file_name: path.basename(filePath),
      size_bytes: stat.size,
      modified_at: stat.mtime.toISOString()
    };
  } catch (error) {
    return {
      exists: false,
      path: filePath,
      file_name: path.basename(filePath),
      size_bytes: 0,
      modified_at: null
    };
  }
}

function getPackageScripts() {
  const pkg = safeReadJson(path.join(PROJECT_ROOT, 'package.json')) || {};
  return pkg.scripts || {};
}

function hasScript(scripts, name) {
  return Boolean(scripts && Object.prototype.hasOwnProperty.call(scripts, name));
}

function getRunbookSections() {
  return [
    'API Server Restart Procedure',
    'Summary Worker Procedure',
    'Daily Operation Worker Procedure',
    'Port 3010 Conflict Recovery',
    'Git Bash Window Layout',
    'Health Check APIs',
    'Reboot Recovery Checklist',
    'Troubleshooting'
  ];
}

function getRunbookCommands() {
  return [
    { key: 'project_path', label: 'Project Path', command: 'cd "/z/01. Ai_Memory_System/api"' },
    { key: 'api_server', label: 'API Server', command: 'npm run dev' },
    { key: 'summary_worker_once', label: 'Summary Worker Once', command: 'npm run worker:summary' },
    { key: 'summary_worker_loop', label: 'Summary Worker Loop', command: 'npm run worker:summary:loop' },
    { key: 'daily_operation_worker', label: 'Daily Operation Worker', command: 'npm run worker:daily-operation' },
    { key: 'find_port_3010', label: 'Find Port 3010 Process', command: 'netstat -ano | findstr :3010' },
    { key: 'kill_pid_git_bash', label: 'Kill PID in Git Bash', command: 'taskkill //PID PID번호 //F' },
    { key: 'admin_console', label: 'Admin Console', command: 'http://localhost:3010/admin?token=AI_Basic_Zarvis_2026' }
  ];
}

function getRunbookStatus() {
  const scripts = getPackageScripts();
  const manual = getFileInfo(RUNBOOK_PATH);

  const requiredScripts = [
    { key: 'dev', label: 'API server npm script', required: true, exists: hasScript(scripts, 'dev'), command: 'npm run dev' },
    { key: 'worker:summary', label: 'Summary worker once script', required: true, exists: hasScript(scripts, 'worker:summary'), command: 'npm run worker:summary' },
    { key: 'worker:summary:loop', label: 'Summary worker loop script', required: true, exists: hasScript(scripts, 'worker:summary:loop'), command: 'npm run worker:summary:loop' },
    { key: 'worker:daily-operation', label: 'Daily operation worker script', required: true, exists: hasScript(scripts, 'worker:daily-operation'), command: 'npm run worker:daily-operation' }
  ];

  const failedScripts = requiredScripts.filter((item) => item.required && !item.exists);
  const status = manual.exists && failedScripts.length === 0 ? 'READY' : 'NOT_READY';

  return {
    ok: status === 'READY',
    phase: '14-5',
    checked_at: new Date().toISOString(),
    status,
    runbook: manual,
    project: {
      root: PROJECT_ROOT,
      docs_dir: DOCS_DIR,
      platform: process.platform,
      hostname: os.hostname(),
      node_version: process.version,
      pid: process.pid
    },
    required_scripts: requiredScripts,
    commands: getRunbookCommands(),
    sections: getRunbookSections(),
    next_action: status === 'READY'
      ? 'Proceed to Phase 14-6 Final Deployment Checklist.'
      : 'Create the runbook document in api/docs and verify package.json worker scripts.'
  };
}

function getRunbookChecklist() {
  const status = getRunbookStatus();
  const docText = status.runbook.exists ? fs.readFileSync(RUNBOOK_PATH, 'utf8') : '';

  const sectionChecks = getRunbookSections().map((section) => ({
    key: section.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    group: 'Documentation',
    label: `${section} is documented.`,
    required: true,
    status: docText.includes(section) ? 'PASS' : 'FAIL'
  }));

  const scriptChecks = status.required_scripts.map((script) => ({
    key: `script_${script.key.replace(/[:]/g, '_')}`,
    group: 'NPM Scripts',
    label: `${script.label} is available in package.json.`,
    required: script.required,
    status: script.exists ? 'PASS' : 'FAIL',
    evidence: { command: script.command }
  }));

  const checklist = [
    {
      key: 'runbook_file_exists',
      group: 'Documentation',
      label: 'Server and worker runbook document exists in api/docs.',
      required: true,
      status: status.runbook.exists ? 'PASS' : 'FAIL',
      evidence: status.runbook
    },
    ...sectionChecks,
    ...scriptChecks,
    {
      key: 'port_conflict_recovery_documented',
      group: 'Recovery',
      label: 'Port 3010 conflict recovery command is documented.',
      required: true,
      status: docText.includes('taskkill //PID') && docText.includes('netstat -ano') ? 'PASS' : 'FAIL'
    },
    {
      key: 'separate_terminal_policy_documented',
      group: 'Operation',
      label: 'API server and worker processes are documented as separate Git Bash windows.',
      required: true,
      status: docText.includes('Git Bash Window Layout') ? 'PASS' : 'FAIL'
    }
  ];

  const failed = checklist.filter((item) => item.required && item.status !== 'PASS');

  return {
    ok: failed.length === 0,
    phase: '14-5',
    checked_at: new Date().toISOString(),
    status: failed.length === 0 ? 'READY' : 'NOT_READY',
    checklist,
    failed_items: failed,
    phase14_6_entry_allowed: failed.length === 0
  };
}

function testRunbook() {
  const status = getRunbookStatus();
  const checklist = getRunbookChecklist();
  const ok = status.status === 'READY' && checklist.ok;

  return {
    ok,
    phase: '14-5',
    tested_at: new Date().toISOString(),
    test_status: ok ? 'PASS' : 'FAIL',
    status,
    checklist_summary: {
      total: checklist.checklist.length,
      failed: checklist.failed_items.length
    },
    failed_items: checklist.failed_items,
    phase14_6_entry_allowed: ok,
    next_phase: ok ? 'Phase 14-6: Final Deployment Checklist' : 'Resolve Phase 14-5 runbook documentation items first.'
  };
}

module.exports = {
  getRunbookStatus,
  getRunbookChecklist,
  testRunbook
};
