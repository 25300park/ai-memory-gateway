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
const codeExecutionService = require('../services/code-execution.service');
const { sendStandardError } = require('../services/api-error.service');
const { isDbConnectionError, buildDbConnectionErrorMessage } = require('../utils/db-error-hint.util');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// -----------------------------------------------------------------------------
// Phase 9-1: lightweight DB health check for the console's connection-error banner.
// Always resolves (never throws to the global error handler) so the console can render
// a clear "DB unreachable" state instead of a bare fetch failure or infinite spinner.
// -----------------------------------------------------------------------------
router.get('/health/db', asyncHandler(async (req, res) => {
  const startedAt = Date.now();

  try {
    await db.query('SELECT 1');
    res.json({ ok: true, latency_ms: Date.now() - startedAt, error: null });
  } catch (error) {
    const message = isDbConnectionError(error) ? buildDbConnectionErrorMessage(error) : error.message;
    res.status(500).json({ ok: false, latency_ms: Date.now() - startedAt, error: message });
  }
}));

router.get('/agent/status', asyncHandler(async (req, res) => {
  res.json(await personalAgent.getStatus(db));
}));

router.get('/agent/projects', asyncHandler(async (req, res) => {
  res.json({ ok: true, projects: await personalAgent.getProjectRules(db) });
}));

router.post('/agent/projects', asyncHandler(async (req, res) => {
  const { guidelines_result, project } = await personalAgent.addProjectRuleWithGuidelines(db, req.body || {});
  res.json({ ok: true, project, guidelines_result });
}));

// Phase 19-1: preview-only - decomposes a free-text department/project description into
// 3-5 {title, content} guidelines via a single Anthropic call. Never touches the DB; the
// caller re-submits the result (possibly edited) to POST /agent/projects as `guidelines`.
router.post('/agent/projects/draft-guidelines', asyncHandler(async (req, res) => {
  try {
    const guidelines = await personalAgent.callGuidelineDecomposer(req.body?.description);
    res.json({ ok: true, guidelines });
  } catch (error) {
    return sendStandardError(res, {
      req,
      code: 'PROVIDER_CALL_FAILED',
      message: error.message,
      statusCode: 502,
      source: 'ai.routes:/agent/projects/draft-guidelines'
    });
  }
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
// Phase 7-1: writer(anthropic) <-> critic(lmstudio) multi-round drafting loop.
// Always makes real provider calls (that's the point of the endpoint), so
// confirm_live: true is required to avoid triggering it by accident.
// -----------------------------------------------------------------------------
router.post('/agent/collab', asyncHandler(async (req, res) => {
  const { question, project_code, max_rounds, confirm_live } = req.body || {};

  if (confirm_live !== true) {
    return sendStandardError(res, {
      req,
      code: 'VALIDATION_ERROR',
      message: 'confirm_live must be true. This endpoint always makes real provider calls (writer=anthropic, critic=lmstudio).',
      statusCode: 400,
      source: 'ai.routes:/agent/collab'
    });
  }

  try {
    const result = await personalAgent.runWriterCriticLoop(db, {
      question,
      projectCode: project_code || 'auto',
      maxRounds: max_rounds
    });
    res.json(result);
  } catch (error) {
    return sendStandardError(res, {
      req,
      code: 'COLLAB_LOOP_FAILED',
      message: error.message,
      statusCode: 502,
      source: 'ai.routes:/agent/collab'
    });
  }
}));

// -----------------------------------------------------------------------------
// Phase 14-1: dev(anthropic) <-> qa(anthropic) development-planning loop, built on the
// same runTwoAgentLoop as /agent/collab. Never writes code or touches files - only
// produces a plan and registers it in pending_actions (action_type: dev_plan_proposal)
// for a human to review. Always makes real provider calls, so confirm_live: true is
// required just like /agent/collab.
// -----------------------------------------------------------------------------
router.post('/agent/dev-qa-plan', asyncHandler(async (req, res) => {
  const { question, project_code, max_rounds, confirm_live } = req.body || {};

  if (confirm_live !== true) {
    return sendStandardError(res, {
      req,
      code: 'VALIDATION_ERROR',
      message: 'confirm_live must be true. This endpoint always makes real provider calls (dev=anthropic, qa=anthropic).',
      statusCode: 400,
      source: 'ai.routes:/agent/dev-qa-plan'
    });
  }

  try {
    const result = await personalAgent.runDevQaPlan(db, {
      question,
      projectCode: project_code || 'auto',
      maxRounds: max_rounds
    });
    res.json(result);
  } catch (error) {
    return sendStandardError(res, {
      req,
      code: 'DEV_QA_PLAN_FAILED',
      message: error.message,
      statusCode: 502,
      source: 'ai.routes:/agent/dev-qa-plan'
    });
  }
}));

// -----------------------------------------------------------------------------
// Phase 14-4: planner(anthropic) -> dev(anthropic) <-> qa(anthropic) 3-role pipeline. The
// planner concretizes the user's (possibly vague) request into scope/purpose/constraints
// once, then the existing dev-qa loop runs against that instead of the raw request.
// Registers pending_actions (action_type: team_plan_proposal). Same confirm_live pattern
// as /agent/collab and /agent/dev-qa-plan.
// -----------------------------------------------------------------------------
router.post('/agent/team-plan', asyncHandler(async (req, res) => {
  const { question, project_code, max_rounds, confirm_live } = req.body || {};

  if (confirm_live !== true) {
    return sendStandardError(res, {
      req,
      code: 'VALIDATION_ERROR',
      message: 'confirm_live must be true. This endpoint always makes real provider calls (planner=anthropic, dev=anthropic, qa=anthropic).',
      statusCode: 400,
      source: 'ai.routes:/agent/team-plan'
    });
  }

  try {
    const result = await personalAgent.runPlanDevQaPipeline(db, {
      question,
      projectCode: project_code || 'auto',
      maxRounds: max_rounds
    });
    res.json(result);
  } catch (error) {
    return sendStandardError(res, {
      req,
      code: 'TEAM_PLAN_FAILED',
      message: error.message,
      statusCode: 502,
      source: 'ai.routes:/agent/team-plan'
    });
  }
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

router.post('/agent/actions/:id/execute', asyncHandler(async (req, res) => {
  const result = await pendingActionsService.executeAction(db, req.params.id);
  if (!result.ok && result.http_status) {
    return sendStandardError(res, {
      req,
      code: result.http_status === 404 ? 'PENDING_ACTION_NOT_FOUND' : 'VALIDATION_ERROR',
      message: result.error,
      statusCode: result.http_status,
      source: 'ai.routes:/agent/actions/:id/execute'
    });
  }
  res.json(result);
}));

// -----------------------------------------------------------------------------
// Phase 12-2: headless code execution for approved code_change_proposal rows -
// isolated git worktree only, diff captured back to the DB, never merged automatically.
// -----------------------------------------------------------------------------
router.post('/agent/actions/:id/execute-code', asyncHandler(async (req, res) => {
  const repoPath = req.body?.repoPath || codeExecutionService.ALLOWED_REPO_PATHS[0];

  if (!codeExecutionService.isAllowedRepoPath(repoPath)) {
    return sendStandardError(res, {
      req,
      code: 'VALIDATION_ERROR',
      message: `repoPath "${repoPath}" is not in the allowed list.`,
      statusCode: 400,
      source: 'ai.routes:/agent/actions/:id/execute-code'
    });
  }

  const result = await codeExecutionService.executeCodeChangeProposal(db, {
    pendingActionId: req.params.id,
    instruction: req.body?.instruction,
    repoPath,
    engine: req.body?.engine
  });

  if (!result.ok && result.http_status) {
    return sendStandardError(res, {
      req,
      code: result.http_status === 404 ? 'PENDING_ACTION_NOT_FOUND' : 'VALIDATION_ERROR',
      message: result.error,
      statusCode: result.http_status,
      source: 'ai.routes:/agent/actions/:id/execute-code'
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
