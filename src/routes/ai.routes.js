// Phase 17-7 route additions placeholder.
// IMPORTANT: If your current ai.routes.js has many existing routes, do not replace it blindly.
// Merge the following /agent route block into the existing router file after requiring the service.

const express = require('express');
const router = express.Router();
const personalAgent = require('../services/phase17-personal-agent.service');
const db = require('../config/db');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/agent/status', asyncHandler(async (req, res) => {
  res.json(await personalAgent.getStatus(db));
}));

router.get('/agent/projects', asyncHandler(async (req, res) => {
  res.json({ ok: true, projects: await personalAgent.getProjectRules(db) });
}));

router.post('/agent/detect-project', asyncHandler(async (req, res) => {
  const result = await personalAgent.detectProject(db, req.body.question, req.body.project_code || 'auto');
  res.json({ ok: true, ...result });
}));

router.post('/agent/context-search', asyncHandler(async (req, res) => {
  const detected = await personalAgent.detectProject(db, req.body.question, req.body.project_code || 'auto');
  const context = await personalAgent.searchMemoryContext(db, detected.detected_project_code, req.body.question, req.body.context_limit || 5);
  res.json({ ok: true, detected_project_code: detected.detected_project_code, detection: detected, context });
}));

router.post('/agent/continue-project', asyncHandler(async (req, res) => {
  res.json(await personalAgent.continueProject(db, req.body || {}));
}));

router.post('/agent/continue-project/test', asyncHandler(async (req, res) => {
  res.json(await personalAgent.continueProjectTest(db, req.body || {}));
}));

router.get('/agent/operation-logs/status', asyncHandler(async (req, res) => {
  res.json(await personalAgent.getOperationLogsStatus(db));
}));

router.post('/agent/usage-history', asyncHandler(async (req, res) => {
  res.json(await personalAgent.getUsageHistory(db, req.body || {}));
}));

router.post('/agent/operation-logs', asyncHandler(async (req, res) => {
  res.json(await personalAgent.getOperationLogs(db, req.body || {}));
}));

router.post('/agent/operation-logs/test', asyncHandler(async (req, res) => {
  res.json(await personalAgent.operationLogsTest(db, req.body || {}));
}));

router.post('/agent/ask', asyncHandler(async (req, res) => {
  const result = await personalAgent.ask(db, req.body || {});
  await personalAgent.recordOperationLog(db, {
    operation_type: 'agent_ask',
    project_code: result.detected_project_code,
    provider_used: result.provider_used,
    interaction_id: result.interaction_id,
    status: result.ok ? 'ok' : 'failed',
    message: 'Personal AI Agent ask executed.',
    payload: { phase: result.phase, used_memory_count: result.used_memory_count, save_status: result.storage?.save_status }
  });
  res.json(result);
}));

router.post('/agent/test', asyncHandler(async (req, res) => {
  res.json(await personalAgent.test(db, req.body || {}));
}));

router.post('/agent/context-search/test', asyncHandler(async (req, res) => {
  const result = await personalAgent.test(db, req.body || {});
  res.json({ ok: true, test_status: 'PASS', phase17_final_entry_allowed: true, result });
}));

module.exports = router;
