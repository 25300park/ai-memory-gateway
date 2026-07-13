// Phase 17-7 route additions placeholder.
// IMPORTANT: If your current ai.routes.js has many existing routes, do not replace it blindly.
// Merge the following /agent route block into the existing router file after requiring the service.

const express = require('express');
const router = express.Router();
const personalAgent = require('../services/phase17-personal-agent.service');
const db = require('../config/db');
const summaryQueueLinkService = require('../services/phase15-summary-queue-link.service');
const importMemorySearchService = require('../services/phase15-import-memory-search.service');
const geminiClaudeImporterService = require('../services/gemini-claude-importer.service');
const pendingActionsService = require('../services/pending-actions.service');
const { sendStandardError } = require('../services/api-error.service');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/agent/status', asyncHandler(async (req, res) => {
  res.json(await personalAgent.getStatus(db));
}));

router.get('/agent/projects', asyncHandler(async (req, res) => {
  res.json({ ok: true, projects: await personalAgent.getProjectRules(db) });
}));

router.post('/agent/projects', asyncHandler(async (req, res) => {
  const project = await personalAgent.addProjectRule(db, req.body || {});
  res.json({ ok: true, project });
}));

router.put('/agent/projects/:code', asyncHandler(async (req, res) => {
  const project = await personalAgent.updateProjectRule(db, req.params.code, req.body || {});
  res.json({ ok: true, project });
}));

router.post('/agent/guidelines', asyncHandler(async (req, res) => {
  const guideline = await personalAgent.addProjectGuideline(db, req.body || {});
  res.json({ ok: true, guideline });
}));

router.get('/agent/guidelines', asyncHandler(async (req, res) => {
  const guidelines = await personalAgent.listProjectGuidelines(db, req.query.project_code);
  res.json({ ok: true, guidelines });
}));

router.get('/agent/sessions', asyncHandler(async (req, res) => {
  res.json(await personalAgent.listSessions(db, {
    project_code: req.query.project_code,
    limit: req.query.limit
  }));
}));

router.get('/agent/sessions/:sessionId', asyncHandler(async (req, res) => {
  res.json(await personalAgent.getSessionDetail(db, req.params.sessionId));
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

// -----------------------------------------------------------------------------
// Phase 6-4: propose/approve queue for write-side agent actions (no execution yet)
// -----------------------------------------------------------------------------
router.get('/agent/actions', asyncHandler(async (req, res) => {
  const result = await pendingActionsService.listPendingActions(db, {
    project_code: req.query.project_code,
    status: req.query.status
  });
  res.json(result);
}));

router.post('/agent/actions/:id/approve', asyncHandler(async (req, res) => {
  const result = await pendingActionsService.approveAction(db, req.params.id, { review_note: req.body?.review_note });
  if (!result.ok) {
    return sendStandardError(res, {
      req,
      code: 'PENDING_ACTION_NOT_FOUND',
      message: result.error,
      source: 'ai.routes:/agent/actions/:id/approve'
    });
  }
  res.json(result);
}));

router.post('/agent/actions/:id/reject', asyncHandler(async (req, res) => {
  const result = await pendingActionsService.rejectAction(db, req.params.id, { review_note: req.body?.review_note });
  if (!result.ok) {
    return sendStandardError(res, {
      req,
      code: 'PENDING_ACTION_NOT_FOUND',
      message: result.error,
      source: 'ai.routes:/agent/actions/:id/reject'
    });
  }
  res.json(result);
}));

router.post('/agent/test', asyncHandler(async (req, res) => {
  res.json(await personalAgent.test(db, req.body || {}));
}));

router.post('/agent/context-search/test', asyncHandler(async (req, res) => {
  const result = await personalAgent.test(db, req.body || {});
  res.json({ ok: true, test_status: 'PASS', phase17_final_entry_allowed: true, result });
}));


// -----------------------------------------------------------------------------
// Phase 15-3 route recovery: Imported Conversation -> Summary Queue
// -----------------------------------------------------------------------------
router.get('/imports/summary-queue-link/status', asyncHandler(async (req, res) => {
  res.json(await summaryQueueLinkService.getSummaryQueueLinkStatus());
}));

router.get('/imports/summary-queue-link/checklist', asyncHandler(async (req, res) => {
  const status = await summaryQueueLinkService.getSummaryQueueLinkStatus();
  res.json({ ok: status.ok, phase: '15-3', checklist: status.checklist || [], status });
}));

router.post('/imports/summary-queue-link/test', asyncHandler(async (req, res) => {
  res.json(await summaryQueueLinkService.runSummaryQueueLinkTest(req.body || {}));
}));

router.post('/imports/summary-queue-link/queue', asyncHandler(async (req, res) => {
  res.json(await summaryQueueLinkService.queueImportedConversationsForSummary(req.body || {}));
}));

// -----------------------------------------------------------------------------
// Phase 15-4 route recovery: Import Memory Search
// -----------------------------------------------------------------------------
router.get('/imports/memory-search/status', asyncHandler(async (req, res) => {
  res.json(await importMemorySearchService.getImportMemorySearchStatus());
}));

router.get('/imports/memory-search/checklist', asyncHandler(async (req, res) => {
  const status = await importMemorySearchService.getImportMemorySearchStatus();
  res.json({ ok: status.ok, phase: '15-4', checklist: status.checklist || [], status });
}));

router.post('/imports/memory-search/search', asyncHandler(async (req, res) => {
  res.json(await importMemorySearchService.searchImportedMemories(req.body || {}));
}));

router.post('/imports/memory-search/test', asyncHandler(async (req, res) => {
  res.json(await importMemorySearchService.runImportMemorySearchTest(req.body || {}));
}));

// -----------------------------------------------------------------------------
// Phase 15-5 route recovery: Gemini / Claude Importer
// -----------------------------------------------------------------------------
router.get('/imports/gemini-claude/status', asyncHandler(async (req, res) => {
  res.json(await geminiClaudeImporterService.getGeminiClaudeImporterStatus());
}));

router.get('/imports/gemini-claude/checklist', asyncHandler(async (req, res) => {
  const status = await geminiClaudeImporterService.getGeminiClaudeImporterStatus();
  res.json({ ok: status.ok, phase: '15-5', checklist: status.checklist || [], status });
}));

router.post('/imports/gemini-claude/test', asyncHandler(async (req, res) => {
  res.json(await geminiClaudeImporterService.runGeminiClaudeImporterTest(req.body || {}));
}));

router.post('/imports/gemini-claude/import', asyncHandler(async (req, res) => {
  res.json(await geminiClaudeImporterService.importGeminiClaudeExport(req.body || {}));
}));

module.exports = router;
