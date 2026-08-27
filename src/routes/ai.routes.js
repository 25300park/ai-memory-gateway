// Phase 17-7 route additions placeholder.
// IMPORTANT: If your current ai.routes.js has many existing routes, do not replace it blindly.
// Merge the following /agent route block into the existing router file after requiring the service.

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const personalAgent = require('../services/phase17-personal-agent.service');
const db = require('../config/db');
const summaryQueueLinkService = require('../services/phase15-summary-queue-link.service');
const importMemorySearchService = require('../services/phase15-import-memory-search.service');
const geminiClaudeImporterService = require('../services/gemini-claude-importer.service');
const importQualityReviewService = require('../services/phase15-import-quality-review.service');
const phase15FinalChecklistService = require('../services/phase15-final-checklist.service');
const phase14SmokeTestService = require('../services/phase14-smoke-test.service');
const chatgptExportImporterService = require('../services/chatgpt-export-importer.service');
const importJobsService = require('../services/import-jobs.service');
const uploadTokensService = require('../services/upload-tokens.service');
const pendingActionsService = require('../services/pending-actions.service');
const codeExecutionService = require('../services/code-execution.service');
const { sendStandardError } = require('../services/api-error.service');
const { isDbConnectionError, buildDbConnectionErrorMessage } = require('../utils/db-error-hint.util');
const { extractAdminToken, validateAdminToken } = require('../services/security.service');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Phase 22-8: the two upload-import routes below sit outside app.js's blanket
// adminApiAuthMiddleware (browsers upload directly to them and must never hold the full
// admin token), so they validate their own auth here - either the real admin token (curl,
// testing, or any other server-side caller keeps working unchanged) or a short-lived,
// single-use upload token minted via POST /imports/upload-token (what the browser actually
// uses). Mounted before importUpload.single('file') so a bad/missing credential is rejected
// before any file bytes are even parsed off the wire.
async function requireAdminOrUploadToken(req, res, next) {
  const { value: adminToken } = extractAdminToken(req, { allowQuery: false });
  if (adminToken && validateAdminToken(adminToken).ok) return next();

  const uploadToken = req.headers['x-upload-token'];
  if (typeof uploadToken === 'string' && uploadToken.trim()) {
    const consumed = await uploadTokensService.consumeUploadToken(uploadToken.trim());
    if (consumed) return next();
  }

  return sendStandardError(res, {
    req,
    code: 'UNAUTHORIZED',
    message: 'A valid x-admin-token or x-upload-token header is required.',
    statusCode: 401,
    source: 'ai.routes:upload-auth'
  });
}

// Phase 21-2: file-upload based (multipart/form-data), so import endpoints work on
// Railway too - the old zip_file_path/file_path shape required the file to already exist
// on the server's own local disk, which only ever worked when the API happened to be
// running on the same PC as the export file. Multer writes the upload to a scratch temp
// dir; each route points its importer's file-path option at that path, then deletes it in
// `finally` regardless of import success/failure - the temp file only ever exists for the
// duration of one request, so Railway's ephemeral filesystem is a non-issue.
// Phase 22-3 reuses this same importUpload instance for /imports/gemini-claude/import
// instead of standing up a second multer config - both importers accept the same
// zip-or-json shape and the same 50MB ceiling.
const IMPORT_TMP_DIR = path.join(os.tmpdir(), 'ai-memory-gateway-import');
fs.mkdirSync(IMPORT_TMP_DIR, { recursive: true });

const importUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMPORT_TMP_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  // Exports can run large (years of conversation history in one file) - 50MB gives real
  // exports headroom without leaving the limit effectively unbounded.
  limits: { fileSize: 50 * 1024 * 1024 }
});

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

// Phase 23-x route recovery: admin/index.html's "testAgentProjectDetectionBtn" has always
// called this path, but it was never wired - same silent-404 pattern as the Phase 15-x
// panels above. Wraps the same detectProject() call /agent/detect-project already uses (no
// question validation there either), in the same {ok, test_status, phase17_final_entry_allowed,
// result} envelope as /agent/context-search/test above. Unlike that sibling route, no
// hardcoded default question is injected here - detectProject() doesn't need one, it already
// degrades gracefully (confidence 0.25, detection_mode:'fallback') when question is empty.
router.post('/agent/project-detection/test', asyncHandler(async (req, res) => {
  const result = await personalAgent.detectProject(db, req.body.question, req.body.project_code || 'auto');
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

// Phase 22-3: file-upload based (multipart/form-data), reusing the same importUpload
// instance (temp dir + 50MB limit) as the Phase 21-2 ChatGPT importer route.
// Phase 22-5: responds with a job_id as soon as the file is on disk instead of waiting for
// the full unzip/parse/insert to finish - the Next.js proxy in front of this backend runs
// as a Vercel serverless function with a ~10s timeout, and even a duplicate-only dedup pass
// over 33 conversations was already taking ~20s. The actual import runs via setImmediate()
// after the response is sent; that's safe here because this is a persistent Railway process,
// not a serverless function that gets torn down once the response goes out.
router.post('/imports/gemini-claude/import', asyncHandler(requireAdminOrUploadToken), importUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return sendStandardError(res, {
      req,
      code: 'VALIDATION_ERROR',
      message: 'file is required (multipart/form-data field name: "file").',
      statusCode: 400,
      source: 'ai.routes:/imports/gemini-claude/import'
    });
  }

  // multipart form fields always arrive as strings - importGeminiClaudeExport's own
  // `options.skip_duplicates !== false` check would treat the string "false" as truthy,
  // so that coercion has to happen here rather than relying on the shared function.
  const skipDuplicates = req.body?.skip_duplicates === undefined
    ? undefined
    : String(req.body.skip_duplicates).toLowerCase() !== 'false';
  const sourcePlatform = req.body?.source_platform;
  const projectCode = req.body?.project_code;
  const limit = req.body?.limit;
  const filePath = req.file.path;

  const jobId = await importJobsService.createImportJob({ platform: sourcePlatform || 'unknown', projectCode });

  res.json({
    ok: true,
    job_id: jobId,
    status: 'queued',
    message: 'Import is running in the background. Poll GET /imports/status/:job_id for progress.'
  });

  setImmediate(async () => {
    try {
      await importJobsService.markImportJobProcessing(jobId);
      const result = await geminiClaudeImporterService.importGeminiClaudeExport({
        source_platform: sourcePlatform,
        zip_file_path: filePath,
        project_code: projectCode,
        skip_duplicates: skipDuplicates,
        limit,
        onProgress: (current, total) => {
          importJobsService.updateImportJobProgress(jobId, (current / total) * 100).catch(() => {});
        }
      });
      if (result.ok === false) {
        await importJobsService.markImportJobFailed(jobId, result.error?.message || 'Import failed.');
      } else {
        await importJobsService.markImportJobCompleted(jobId, result);
      }
    } catch (error) {
      await importJobsService.markImportJobFailed(jobId, error.message);
    } finally {
      fs.unlink(filePath, () => {});
    }
  });
}));

// -----------------------------------------------------------------------------
// Phase 15-6 route recovery: Import Quality Review - same silent-404 pattern as the
// other Phase 15-x importer panels below: admin/index.html's Import Quality Review
// panel has always called these five paths, but they were never wired to a route.
// -----------------------------------------------------------------------------
router.get('/imports/quality-review/status', asyncHandler(async (req, res) => {
  res.json(await importQualityReviewService.getImportQualityReviewStatus());
}));

router.get('/imports/quality-review/checklist', asyncHandler(async (req, res) => {
  const status = await importQualityReviewService.getImportQualityReviewStatus();
  res.json({ ok: status.ok, phase: '15-6', checklist: status.checklist || [], status });
}));

router.post('/imports/quality-review/test', asyncHandler(async (req, res) => {
  res.json(await importQualityReviewService.runImportQualityReviewTest(req.body || {}));
}));

router.post('/imports/quality-review/review', asyncHandler(async (req, res) => {
  res.json(await importQualityReviewService.reviewImportedConversationQuality(req.body || {}));
}));

router.post('/imports/quality-review/duplicates', asyncHandler(async (req, res) => {
  res.json(await importQualityReviewService.scanDuplicateCandidates(req.body || {}));
}));

// -----------------------------------------------------------------------------
// Phase 15-7 route recovery: Import Final Checklist - same silent-404 pattern as the
// Phase 15-2/15-3/15-4/15-5/15-6 panels above. Unlike 15-6 (whose service has no dedicated
// checklist function, so that route re-derives {checklist} from the status call),
// phase15-final-checklist.service.js already exports getPhase15FinalStatus(),
// getPhase15FinalChecklist(), and runPhase15FinalTest() as three separate purpose-built
// functions - each route below calls its own matching function directly, not a shared one.
// -----------------------------------------------------------------------------
router.get('/imports/final/status', asyncHandler(async (req, res) => {
  res.json(await phase15FinalChecklistService.getPhase15FinalStatus());
}));

router.get('/imports/final/checklist', asyncHandler(async (req, res) => {
  res.json(await phase15FinalChecklistService.getPhase15FinalChecklist());
}));

router.post('/imports/final/test', asyncHandler(async (req, res) => {
  res.json(await phase15FinalChecklistService.runPhase15FinalTest(req.body || {}));
}));

// -----------------------------------------------------------------------------
// Phase 15-2 route recovery: ChatGPT Export Importer - these functions existed since
// Phase 15-2 but were never wired to a route (dashboard.js has always called them though,
// so this was a silent 404 for anyone using the ChatGPT importer panel).
// -----------------------------------------------------------------------------
router.get('/imports/chatgpt/status', asyncHandler(async (req, res) => {
  res.json(await chatgptExportImporterService.getChatGPTImporterStatus());
}));

router.get('/imports/chatgpt/checklist', asyncHandler(async (req, res) => {
  // dashboard.js reads response.checklist (see renderChatGPTImporterChecklist) - wrap the
  // bare array the same way the gemini-claude checklist route does, rather than returning
  // getChatGPTImporterChecklist()'s array directly.
  res.json({ ok: true, phase: '15-2', checklist: chatgptExportImporterService.getChatGPTImporterChecklist() });
}));

router.post('/imports/chatgpt/test', asyncHandler(async (req, res) => {
  res.json(await chatgptExportImporterService.runChatGPTImporterTest(req.body || {}));
}));

// Phase 22-5: same background-processing pattern as /imports/gemini-claude/import above -
// respond with a job_id immediately, run the real import via setImmediate() after that.
router.post('/imports/chatgpt/import', asyncHandler(requireAdminOrUploadToken), importUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return sendStandardError(res, {
      req,
      code: 'VALIDATION_ERROR',
      message: 'file is required (multipart/form-data field name: "file").',
      statusCode: 400,
      source: 'ai.routes:/imports/chatgpt/import'
    });
  }

  // multipart form fields always arrive as strings - importChatGPTExportFromZip's own
  // `options.skip_duplicates !== false` check would treat the string "false" as truthy,
  // so that coercion has to happen here rather than relying on the shared function.
  const skipDuplicates = req.body?.skip_duplicates === undefined
    ? undefined
    : String(req.body.skip_duplicates).toLowerCase() !== 'false';
  const projectCode = req.body?.project_code;
  const limit = req.body?.limit;
  const filePath = req.file.path;

  const jobId = await importJobsService.createImportJob({ platform: 'chatgpt', projectCode });

  res.json({
    ok: true,
    job_id: jobId,
    status: 'queued',
    message: 'Import is running in the background. Poll GET /imports/status/:job_id for progress.'
  });

  setImmediate(async () => {
    try {
      await importJobsService.markImportJobProcessing(jobId);
      const result = await chatgptExportImporterService.importChatGPTExportFromZip({
        zip_file_path: filePath,
        project_code: projectCode,
        skip_duplicates: skipDuplicates,
        limit,
        onProgress: (current, total) => {
          importJobsService.updateImportJobProgress(jobId, (current / total) * 100).catch(() => {});
        }
      });
      if (result.ok === false) {
        await importJobsService.markImportJobFailed(jobId, result.error?.message || 'Import failed.');
      } else {
        await importJobsService.markImportJobCompleted(jobId, result);
      }
    } catch (error) {
      await importJobsService.markImportJobFailed(jobId, error.message);
    } finally {
      fs.unlink(filePath, () => {});
    }
  });
}));

// -----------------------------------------------------------------------------
// Phase 22-8: mints the short-lived upload token requireAdminOrUploadToken accepts above.
// Stays behind app.js's blanket adminApiAuthMiddleware (not in UPLOAD_PATHS_RELATIVE) - only
// the console's server-side /api/import/upload route calls this, using the real admin token,
// then hands the short-lived token to the browser for the actual file upload.
// -----------------------------------------------------------------------------
router.post('/imports/upload-token', asyncHandler(async (req, res) => {
  const { token, expires_at } = await uploadTokensService.createUploadToken();
  res.json({ ok: true, token, expires_at });
}));

// -----------------------------------------------------------------------------
// Phase 22-5: shared job-status polling endpoint for both importers above.
// -----------------------------------------------------------------------------
router.get('/imports/status/:jobId', asyncHandler(async (req, res) => {
  const job = await importJobsService.getImportJobStatus(req.params.jobId);
  if (!job) {
    return sendStandardError(res, {
      req,
      code: 'IMPORT_JOB_NOT_FOUND',
      message: `No import job found for job_id "${req.params.jobId}".`,
      statusCode: 404,
      source: 'ai.routes:/imports/status/:jobId'
    });
  }
  res.json({ ok: true, job });
}));

// -----------------------------------------------------------------------------
// Phase 23-1: task board - mounted as a sub-router so it inherits the aiRateLimiter +
// adminApiAuthMiddleware already applied to this whole /ai mount in app.js, same as every
// other route above (no browser-direct-access carve-out like the Phase 22-8 upload routes).
// -----------------------------------------------------------------------------
router.use('/task-board', require('./task-board.routes'));

// -----------------------------------------------------------------------------
// Phase 14-1 route recovery: Smoke Test - same silent-404 pattern as the Phase 15-x panels
// above. phase14-smoke-test.service.js already exports getPhase14SmokeStatus(),
// getPhase14SmokeChecklist(), and runPhase14SmokeTest() as three separate purpose-built
// functions (the 15-7 pattern, not 15-6's reconstruct-from-status pattern) - each route
// below calls its own matching function directly. admin/index.html has always called these
// three paths (hyphen-joined, not slash-joined like the Operator Manual panel below it).
// -----------------------------------------------------------------------------
router.get('/system/phase14-smoke-status', asyncHandler(async (req, res) => {
  res.json(await phase14SmokeTestService.getPhase14SmokeStatus());
}));

router.get('/system/phase14-smoke-checklist', asyncHandler(async (req, res) => {
  res.json(await phase14SmokeTestService.getPhase14SmokeChecklist());
}));

router.post('/system/phase14-smoke-test', asyncHandler(async (req, res) => {
  res.json(await phase14SmokeTestService.runPhase14SmokeTest(req.body || {}));
}));

module.exports = router;
