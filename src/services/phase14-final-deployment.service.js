const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DOCS_DIR = path.join(PROJECT_ROOT, "docs");
const DEPLOYMENT_DOC = "AI_Memory_Gateway_Phase14_6_Final_Deployment_Checklist.md";

function nowIso() { return new Date().toISOString(); }

function fileStatus(fileName) {
  const filePath = path.join(DOCS_DIR, fileName);
  try {
    const stat = fs.statSync(filePath);
    return { file_name: fileName, path: filePath, exists: true, size_bytes: stat.size, modified_at: stat.mtime.toISOString() };
  } catch (error) {
    return { file_name: fileName, path: filePath, exists: false, size_bytes: 0, modified_at: null };
  }
}

function getRequiredDocuments() {
  return [
    "AI_Memory_Gateway_Phase14_4_Operator_Manual_Final.md",
    "AI_Memory_Gateway_Phase14_5_Server_Worker_Runbook.md",
    DEPLOYMENT_DOC
  ];
}

function getDeploymentCommands() {
  return [
    { key: "api_server", label: "API Server", command: 'cd "/z/01. Ai_Memory_System/api" && npm run dev', purpose: "Start API server on port 3010." },
    { key: "summary_worker_once", label: "Summary Worker Once", command: 'cd "/z/01. Ai_Memory_System/api" && npm run worker:summary', purpose: "Process pending summary queue once." },
    { key: "summary_worker_loop", label: "Summary Worker Loop", command: 'cd "/z/01. Ai_Memory_System/api" && npm run worker:summary:loop', purpose: "Run summary worker continuously." },
    { key: "daily_operation_worker", label: "Daily Operation Worker", command: 'cd "/z/01. Ai_Memory_System/api" && npm run worker:daily-operation', purpose: "Run daily automation scheduler." },
    { key: "port_3010_check", label: "Port 3010 Check", command: "netstat -ano | findstr :3010", purpose: "Find process using port 3010." },
    { key: "port_3010_kill", label: "Port 3010 Kill", command: "taskkill //PID PID_NUMBER //F", purpose: "Kill port-conflicting process in Git Bash." }
  ];
}

function getDeploymentChecklist() {
  const docs = getRequiredDocuments().map(fileStatus);
  const docMap = Object.fromEntries(docs.map((doc) => [doc.file_name, doc]));
  return [
    { key: "operator_manual_exists", group: "Documentation", label: "Operator manual exists in api/docs.", required: true, status: docMap["AI_Memory_Gateway_Phase14_4_Operator_Manual_Final.md"]?.exists ? "PASS" : "FAIL", evidence: docMap["AI_Memory_Gateway_Phase14_4_Operator_Manual_Final.md"] },
    { key: "runbook_exists", group: "Documentation", label: "Server & Worker Runbook exists in api/docs.", required: true, status: docMap["AI_Memory_Gateway_Phase14_5_Server_Worker_Runbook.md"]?.exists ? "PASS" : "FAIL", evidence: docMap["AI_Memory_Gateway_Phase14_5_Server_Worker_Runbook.md"] },
    { key: "deployment_checklist_exists", group: "Documentation", label: "Final Deployment Checklist exists in api/docs.", required: true, status: docMap[DEPLOYMENT_DOC]?.exists ? "PASS" : "FAIL", evidence: docMap[DEPLOYMENT_DOC] },
    { key: "admin_token_configured", group: "Security", label: "ADMIN_TOKEN is configured.", required: true, status: process.env.ADMIN_TOKEN ? "PASS" : "FAIL", evidence: { configured: Boolean(process.env.ADMIN_TOKEN) } },
    { key: "secondary_token_recommended", group: "Security", label: "Secondary admin token is configured for token rotation.", required: false, status: process.env.SECONDARY_ADMIN_TOKEN || process.env.ADMIN_TOKEN_NEXT ? "PASS" : "WARNING", evidence: { configured: Boolean(process.env.SECONDARY_ADMIN_TOKEN || process.env.ADMIN_TOKEN_NEXT) } },
    { key: "dangerous_confirmation_enabled", group: "Security", label: "Dangerous action confirmation remains enabled or defaults to enabled.", required: true, status: process.env.DANGEROUS_ACTION_ENFORCEMENT_ENABLED === "false" ? "FAIL" : "PASS", evidence: { DANGEROUS_ACTION_ENFORCEMENT_ENABLED: process.env.DANGEROUS_ACTION_ENFORCEMENT_ENABLED || "default_enabled" } },
    { key: "production_mode_reviewed", group: "Admin Console", label: "Production mode / dev mode policy is reviewed.", required: true, status: "MANUAL_CHECK", evidence: { ADMIN_CONSOLE_MODE: process.env.ADMIN_CONSOLE_MODE || "development", ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS: process.env.ADMIN_PRODUCTION_HIDE_DEVELOPER_MENUS || "not_set" } },
    { key: "backup_directory_configured", group: "Backup", label: "DB_BACKUP_DIR is configured or default backup path is available.", required: true, status: process.env.DB_BACKUP_DIR ? "PASS" : "WARNING", evidence: { DB_BACKUP_DIR: process.env.DB_BACKUP_DIR || "default: ../backup" } },
    { key: "worker_commands_documented", group: "Workers", label: "API server and worker commands are documented.", required: true, status: "PASS", evidence: { command_count: getDeploymentCommands().length } },
    { key: "final_smoke_test_before_completion", group: "Final Gate", label: "Run Phase 14 Smoke Test once more before final completion decision.", required: true, status: "MANUAL_CHECK", evidence: { endpoint: "POST /ai/system/phase14-smoke-test" } }
  ];
}

function summarizeChecklist(checklist) {
  const required = checklist.filter((item) => item.required);
  const failed = required.filter((item) => item.status === "FAIL");
  const manual = checklist.filter((item) => item.status === "MANUAL_CHECK" || item.status === "WARNING");
  const passed = checklist.filter((item) => item.status === "PASS");
  let deployment_status = "READY_WITH_MANUAL_CHECKS";
  let phase14_7_entry_allowed = true;
  if (failed.length > 0) { deployment_status = "NOT_READY"; phase14_7_entry_allowed = false; }
  else if (manual.length === 0) { deployment_status = "READY_FOR_FINAL_REPORT"; }
  return { total: checklist.length, required: required.length, passed: passed.length, failed: failed.length, manual_check_items: manual.length, deployment_status, phase14_7_entry_allowed };
}

function getFinalDeploymentStatus() {
  const checklist = getDeploymentChecklist();
  const summary = summarizeChecklist(checklist);
  return { ok: summary.phase14_7_entry_allowed, phase: "14-6", checked_at: nowIso(), status: summary.deployment_status, phase14_7_entry_allowed: summary.phase14_7_entry_allowed, summary, documents: getRequiredDocuments().map(fileStatus), commands: getDeploymentCommands(), next_action: summary.phase14_7_entry_allowed ? "Proceed to Phase 14-7 Project Completion Report after completing manual checks." : "Resolve failed deployment checklist items before Phase 14-7." };
}

function getFinalDeploymentChecklist() {
  const checklist = getDeploymentChecklist();
  return { ok: true, phase: "14-6", checked_at: nowIso(), summary: summarizeChecklist(checklist), checklist };
}

function runFinalDeploymentTest(body = {}) {
  const scenario = body.scenario || "current";
  const checklist = getDeploymentChecklist();
  const summary = summarizeChecklist(checklist);
  return { ok: summary.phase14_7_entry_allowed, phase: "14-6", test_status: summary.phase14_7_entry_allowed ? "PASS" : "FAIL", scenario, phase14_7_entry_allowed: summary.phase14_7_entry_allowed, status: getFinalDeploymentStatus(), checklist, failed_items: checklist.filter((item) => item.status === "FAIL"), manual_check_items: checklist.filter((item) => item.status === "MANUAL_CHECK" || item.status === "WARNING"), next_action: summary.phase14_7_entry_allowed ? "Phase 14-6 passed. Continue to Phase 14-7 Project Completion Report." : "Resolve failed deployment checklist items first." };
}

module.exports = { getFinalDeploymentStatus, getFinalDeploymentChecklist, runFinalDeploymentTest };
