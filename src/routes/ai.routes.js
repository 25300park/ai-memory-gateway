const express = require("express");
const router = express.Router();

const {
  getAdminSecurityStatus,
  getAdminSecurityEvents
} = require("../services/security.service");

const {
  getPermissionStatus,
  getRolesMatrix,
  getPermissionPolicies,
  checkAdminPermission,
  getAdminPermissionEvents
} = require("../services/admin-permission.service");

const {
  getDangerousActionStatus,
  getDangerousActionCatalog,
  getDangerousActionEvents,
  validateDangerousActionRequest,
  requireDangerousAction
} = require("../services/dangerous-action.service");

const {
  getApiErrorStandardStatus,
  getApiErrorCatalog,
  getApiErrorExamples,
  runApiErrorResponseTest
} = require("../services/api-error.service");

const {
  getEnvironmentValidationStatus,
  getEnvironmentValidationChecklist,
  runEnvironmentValidationTest
} = require("../services/env-config.service");

const {
  getProductionDeploymentStatus,
  getProductionDeploymentChecklist,
  runProductionDeploymentTest
} = require("../services/deployment-checklist.service");

const {
  getAdminConsoleModeStatus,
  getAdminConsoleModeChecklist,
  runAdminConsoleModeTest
} = require("../services/admin-console-mode.service");

const {
  getPhase12CompletionChecklist,
  runPhase12FinalDecision
} = require("../services/phase12-final.service");
const {
  getPhase13CompletionChecklist,
  runPhase13FinalDecision,
  runPhase13FinalTest
} = require("../services/phase13-final.service");

const {
  getPhase14SmokeStatus,
  getPhase14SmokeChecklist,
  runPhase14SmokeTest
} = require("../services/phase14-smoke-test.service");

const {
  getProductionMenuCleanupStatus,
  getProductionMenuCleanupChecklist,
  runProductionMenuCleanupTest
} = require("../services/phase14-menu-cleanup.service");

const {
  getDevMenuPolicy,
  getDevMenuFinalChecklist,
  testDevMenuFinalPolicy
} = require("../services/phase14-dev-menu-final.service");

const {
  getDatabaseBackupStatus,
  getDatabaseBackupChecklist,
  runDatabaseBackupStatusTest,
  runManualDatabaseBackup,
  getManualDatabaseBackupChecklist,
  runManualDatabaseBackupTest,
  getBackupHistory,
  getBackupHistoryStats,
  syncBackupFilesToHistory,
  getBackupHistoryChecklist,
  runBackupHistoryTest,
  getRestoreReadinessStatus,
  getRestoreReadinessChecklist,
  runRestoreReadinessTest
} = require("../services/backup-status.service");

const {
  getSystemMonitoringDashboard,
  getSystemMonitoringChecklist,
  runSystemMonitoringTest,
  getDetailedResourceMonitoring,
  getWorkerMonitoringStatus,
  getResourceMonitoringChecklist,
  runDetailedMonitoringTest,
  getAlertRulesStatus,
  getAlertRulesCatalog,
  getAlertRulesChecklist,
  runAlertRulesTest
} = require("../services/system-monitoring.service");

const {
  buildContext,
  buildContextPacket,
  buildContextPreview,
  buildProductionContextAssembly,
  extractKeywords,
  getLongTermMemory
} = require("../services/context.service");
const { buildAiRequestPipelineDraft } = require("../services/ai-pipeline.service");
const { runMemoryContextResponseTest } = require("../services/ai-response-test.service");
const { runPhase10FinalDecision } = require("../services/phase10-final.service");
const { getPhase10CompletionReport } = require("../services/phase10-completion.service");
const {
  runPhase11FinalDecision,
  getPhase11CompletionChecklist
} = require("../services/phase11-final.service");
const {
  getProviderCatalog,
  getModelProfileColumns,
  listNormalizedModelProfiles,
  normalizeModelProfile,
  testProviderAdapter,
  getOpenAiLiveStatus,
  testOpenAiLiveProvider,
  listOpenAiAvailableModels,
  getAnthropicLiveStatus,
  testAnthropicLiveProvider,
  listAnthropicAvailableModels,
  getGeminiLiveStatus,
  testGeminiLiveProvider,
  listGeminiAvailableModels
} = require("../services/model-provider.service");

const {
  getProviderRoutingRules,
  getProviderRouterStatus,
  selectProviderRoute,
  testProviderRouter,
  getFallbackScenarioDefinitions,
  runProviderFallbackTest,
  runProviderFallbackMatrix,
  getPhase11FinalPreparation
} = require("../services/provider-router.service");

const {
  processSummaryQueueBatch,
  drainPendingSummaryQueue,
  getSummaryWorkerStatus,
  getSummaryIntegrationStatus
} = require("../services/summary-worker.service");
const { selectModel } = require("../services/router.service");
const { buildPrompt } = require("../services/prompt.service");
const { getResponse } = require("../services/model.factory");
const {
  logConversation,
  cleanupRecentBuffer,
  getResponseStorageStatus
} = require("../services/logger.service");
const {
  searchMemory,
  getRecentMemory,
  getSessionLogs,
  getProjectAssets,
  saveManualMemory,
  updateMemoryStatus,
  createProjectAsset,
  updateProjectAsset,
  retryFailedSummaryQueue,
  retrySummaryQueueItem,
  resetStuckProcessingQueue,
  getSummaryQueueStats,
  getSummaryQueue,
  getMemoryById,
  getConversationById,
  getProjectList
} = require("../services/memory.service");
const {
  getSystemStatus,
  getDailyHealthCheck,
  saveDailyHealthCheck,
  getDailyHealthCheckHistory,
  getDailyOperationChecklist,
  updateDailyOperationChecklistItem,
  resetDailyOperationChecklist,
  getDailyAutomationConfig,
  updateDailyAutomationConfig,
  runDailyOperationAutomation,
  getDailyAutomationHistory,
  getAutomationSafetyStatus,
  releaseSystemOperationLock,
  getOperationLogs,
  createOperationLog,
  cleanupOperationLogs,
  getOperationReportSummary,
  getPhase9FinalChecklist,
  updatePhase9FinalChecklistItem,
  resetPhase9FinalChecklist,
  getPhase9FinalDecision
} = require("../services/system.service");
const {
  success,
  fail,
  validationFail,
  notFound
} = require("../utils/response.util");
const adminApiAuthMiddleware = require("../middlewares/admin-api-auth.middleware");



router.post("/ask", async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      user_id,
      question
    } = req.body;

    if (!project_code || !session_id || !question) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required."
      });
    }

    const context = await buildContext({
      project_code,
      session_id,
      question
    });

    const modelProfile = await selectModel({
      question
    });

    const finalPrompt = await buildPrompt({
      question,
      context
    });

    const responseResult = await getResponse({
      modelProfile,
      finalPrompt
    });

    const answer =
      typeof responseResult === "string"
        ? responseResult
        : responseResult.answer;

    const storedAssistantMessage =
      typeof responseResult === "string"
        ? responseResult
        : responseResult.storedAssistantMessage || responseResult.answer;

    await logConversation({
      project_code,
      session_id,
      user_id,
      source_ai: modelProfile.provider,
      model_name: modelProfile.model_name,
      user_message: question,
      assistant_message: storedAssistantMessage,
      raw_text: `User: ${question}\nAssistant: ${storedAssistantMessage}`
    });

    res.json({
      ok: true,
      model: modelProfile.model_code,
      provider: modelProfile.provider,
      answer
    });
  } catch (error) {
    console.error("AI ask error:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/memory/search", async (req, res) => {
  try {
    const { project_code, keyword, limit } = req.query;

    if (!project_code) {
      return res.status(400).json({
        ok: false,
        error: "project_code is required."
      });
    }

    const results = await searchMemory({
      project_code,
      keyword: keyword || "",
      limit: limit || 10
    });

    res.json({
      ok: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error("Memory search error:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/memory/recent", async (req, res) => {
  try {
    const { project_code, limit } = req.query;

    if (!project_code) {
      return res.status(400).json({
        ok: false,
        error: "project_code is required."
      });
    }

    const results = await getRecentMemory({
      project_code,
      limit: limit || 10
    });

    res.json({
      ok: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error("Recent memory error:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/session/:session_id", async (req, res) => {
  try {
    const { session_id } = req.params;
    const { limit } = req.query;

    const results = await getSessionLogs({
      session_id,
      limit: limit || 20
    });

    res.json({
      ok: true,
      session_id,
      count: results.length,
      results
    });
  } catch (error) {
    console.error("Session logs error:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/project/:project_code/assets", async (req, res) => {
  try {
    const { project_code } = req.params;

    const results = await getProjectAssets({
      project_code
    });

    res.json({
      ok: true,
      project_code,
      count: results.length,
      results
    });
  } catch (error) {
    console.error("Project assets error:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});




// ======================================================
// Phase 12-4: API Error Response Standardization
// ======================================================
router.get("/security/api-errors/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getApiErrorStandardStatus());
  } catch (error) {
    console.error("API error standard status error:", error);
    return fail(res, {
      code: "API_ERROR_STANDARD_STATUS_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "api-error.routes"
    });
  }
});

router.get("/security/api-errors/catalog", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getApiErrorCatalog());
  } catch (error) {
    console.error("API error catalog error:", error);
    return fail(res, {
      code: "API_ERROR_CATALOG_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "api-error.routes"
    });
  }
});

router.get("/security/api-errors/examples", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getApiErrorExamples());
  } catch (error) {
    console.error("API error examples error:", error);
    return fail(res, {
      code: "API_ERROR_EXAMPLES_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "api-error.routes"
    });
  }
});

router.post("/security/api-errors/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const scenario = req.body?.scenario || "validation";
    const payload = runApiErrorResponseTest({ req, scenario });
    return res.status(payload.error.http_status || 400).json(payload);
  } catch (error) {
    console.error("API error response test error:", error);
    return fail(res, {
      code: "API_ERROR_RESPONSE_TEST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "api-error.routes"
    });
  }
});


// ======================================================
// Phase 12-5: Environment Config Validation
// ======================================================
router.get("/security/env-config/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getEnvironmentValidationStatus());
  } catch (error) {
    console.error("Environment config status error:", error);
    return fail(res, {
      code: "ENV_CONFIG_STATUS_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "env-config.routes"
    });
  }
});

router.get("/security/env-config/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getEnvironmentValidationChecklist());
  } catch (error) {
    console.error("Environment config checklist error:", error);
    return fail(res, {
      code: "ENV_CONFIG_CHECKLIST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "env-config.routes"
    });
  }
});

router.post("/security/env-config/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const scenario = req.body?.scenario || "current";
    return res.json(runEnvironmentValidationTest({ scenario }));
  } catch (error) {
    console.error("Environment config test error:", error);
    return fail(res, {
      code: "ENV_CONFIG_TEST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "env-config.routes"
    });
  }
});


// ======================================================
// Phase 12-6: Production Deployment Checklist
// ======================================================
router.get("/security/deployment/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getProductionDeploymentStatus());
  } catch (error) {
    console.error("Deployment status error:", error);
    return fail(res, {
      code: "DEPLOYMENT_STATUS_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "deployment.routes"
    });
  }
});

router.get("/security/deployment/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getProductionDeploymentChecklist());
  } catch (error) {
    console.error("Deployment checklist error:", error);
    return fail(res, {
      code: "DEPLOYMENT_CHECKLIST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "deployment.routes"
    });
  }
});

router.post("/security/deployment/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const scenario = req.body?.scenario || "current";
    return res.json(runProductionDeploymentTest({ scenario }));
  } catch (error) {
    console.error("Deployment readiness test error:", error);
    return fail(res, {
      code: "DEPLOYMENT_TEST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "deployment.routes"
    });
  }
});



// ======================================================
// Phase 12 Final: Security / Deployment Stabilization Completion
// ======================================================
router.get("/system/phase12-completion-checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await getPhase12CompletionChecklist());
  } catch (error) {
    console.error("Phase 12 completion checklist error:", error);
    return fail(res, {
      code: "PHASE12_COMPLETION_CHECKLIST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "phase12-final.routes"
    });
  }
});

router.get("/system/phase12-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await runPhase12FinalDecision());
  } catch (error) {
    console.error("Phase 12 final decision error:", error);
    return fail(res, {
      code: "PHASE12_FINAL_DECISION_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "phase12-final.routes"
    });
  }
});

router.post("/system/phase12-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await runPhase12FinalDecision());
  } catch (error) {
    console.error("Phase 12 final decision error:", error);
    return fail(res, {
      code: "PHASE12_FINAL_DECISION_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "phase12-final.routes"
    });
  }
});


// ======================================================
// Phase 13-1: Database Backup Status
// ======================================================
router.get("/backup/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await getDatabaseBackupStatus());
  } catch (error) {
    console.error("Database backup status error:", error);
    return fail(res, {
      code: "BACKUP_STATUS_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "backup-status.routes"
    });
  }
});

router.get("/backup/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getDatabaseBackupChecklist());
  } catch (error) {
    console.error("Database backup checklist error:", error);
    return fail(res, {
      code: "BACKUP_CHECKLIST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "backup-status.routes"
    });
  }
});

router.post("/backup/status/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await runDatabaseBackupStatusTest({ scenario: req.body?.scenario || "current" }));
  } catch (error) {
    console.error("Database backup status test error:", error);
    return fail(res, {
      code: "BACKUP_STATUS_TEST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "backup-status.routes"
    });
  }
});

// ======================================================
// Phase 13-2: Manual Database Backup Execution
// ======================================================
router.post("/backup/manual", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runManualDatabaseBackup(req.body || {});
    return res.status(result.ok === false ? 500 : 200).json(result);
  } catch (error) {
    console.error("Manual database backup error:", error);
    return fail(res, {
      code: error.code || "MANUAL_BACKUP_FAILED",
      message: error.message,
      statusCode: error.statusCode || 500,
      req,
      source: "manual-backup.routes",
      details: {
        required_confirmation: error.required_confirmation || undefined
      }
    });
  }
});

router.get("/backup/manual/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getManualDatabaseBackupChecklist());
  } catch (error) {
    console.error("Manual database backup checklist error:", error);
    return fail(res, {
      code: "MANUAL_BACKUP_CHECKLIST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "manual-backup.routes"
    });
  }
});

router.post("/backup/manual/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await runManualDatabaseBackupTest({ scenario: req.body?.scenario || "dry_run" }));
  } catch (error) {
    console.error("Manual database backup test error:", error);
    return fail(res, {
      code: "MANUAL_BACKUP_TEST_FAILED",
      message: error.message,
      statusCode: error.statusCode || 500,
      req,
      source: "manual-backup.routes"
    });
  }
});


// ======================================================
// Phase 13-3: Backup History Storage
// ======================================================
router.get("/backup/history", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await getBackupHistory({
      limit: req.query?.limit || 50,
      status: req.query?.status || "",
      source: req.query?.source || ""
    }));
  } catch (error) {
    console.error("Backup history error:", error);
    return fail(res, {
      code: "BACKUP_HISTORY_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "backup-history.routes"
    });
  }
});

router.get("/backup/history/stats", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await getBackupHistoryStats({ days: req.query?.days || 30 }));
  } catch (error) {
    console.error("Backup history stats error:", error);
    return fail(res, {
      code: "BACKUP_HISTORY_STATS_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "backup-history.routes"
    });
  }
});

router.get("/backup/history/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getBackupHistoryChecklist());
  } catch (error) {
    console.error("Backup history checklist error:", error);
    return fail(res, {
      code: "BACKUP_HISTORY_CHECKLIST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "backup-history.routes"
    });
  }
});

router.post("/backup/history/sync-files", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await syncBackupFilesToHistory({ limit: req.body?.limit || 100 }));
  } catch (error) {
    console.error("Backup history sync error:", error);
    return fail(res, {
      code: "BACKUP_HISTORY_SYNC_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "backup-history.routes"
    });
  }
});

router.post("/backup/history/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await runBackupHistoryTest({ scenario: req.body?.scenario || "current" }));
  } catch (error) {
    console.error("Backup history test error:", error);
    return fail(res, {
      code: "BACKUP_HISTORY_TEST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "backup-history.routes"
    });
  }
});



// ======================================================
// Phase 13-4: Restore Readiness Checklist
// ======================================================
router.get("/backup/restore-readiness", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await getRestoreReadinessStatus());
  } catch (error) {
    console.error("Restore readiness status error:", error);
    return fail(res, {
      code: "RESTORE_READINESS_STATUS_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "restore-readiness.routes"
    });
  }
});

router.get("/backup/restore-readiness/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getRestoreReadinessChecklist());
  } catch (error) {
    console.error("Restore readiness checklist error:", error);
    return fail(res, {
      code: "RESTORE_READINESS_CHECKLIST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "restore-readiness.routes"
    });
  }
});

router.post("/backup/restore-readiness/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await runRestoreReadinessTest({ scenario: req.body?.scenario || "current" }));
  } catch (error) {
    console.error("Restore readiness test error:", error);
    return fail(res, {
      code: "RESTORE_READINESS_TEST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "restore-readiness.routes"
    });
  }
});

// ======================================================
// Phase 12-7: Admin Console Production Mode / Dev Mode
// ======================================================
router.get("/security/admin-console/mode/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getAdminConsoleModeStatus());
  } catch (error) {
    console.error("Admin console mode status error:", error);
    return fail(res, {
      code: "ADMIN_CONSOLE_MODE_STATUS_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "admin-console-mode.routes"
    });
  }
});

router.get("/security/admin-console/mode/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getAdminConsoleModeChecklist());
  } catch (error) {
    console.error("Admin console mode checklist error:", error);
    return fail(res, {
      code: "ADMIN_CONSOLE_MODE_CHECKLIST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "admin-console-mode.routes"
    });
  }
});

router.post("/security/admin-console/mode/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const scenario = req.body?.scenario || "current";
    return res.json(runAdminConsoleModeTest({ scenario }));
  } catch (error) {
    console.error("Admin console mode test error:", error);
    return fail(res, {
      code: "ADMIN_CONSOLE_MODE_TEST_FAILED",
      message: error.message,
      statusCode: 500,
      req,
      source: "admin-console-mode.routes"
    });
  }
});

router.post("/context/build", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      user_message,
      question,
      include_text
    } = req.body;

    const finalMessage = user_message || question;

    if (!project_code || !session_id || !finalMessage) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and user_message are required.",
        example: {
          project_code: "rbs_ai_memory",
          session_id: "phase-10-1-test-001",
          user_message: "Build a context packet for this question.",
          include_text: true
        }
      });
    }

    const result = await buildContextPacket({
      project_code,
      session_id,
      user_message: finalMessage,
      include_text: include_text !== false
    });

    return res.json(result);
  } catch (error) {
    console.error("Context build error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/context/build", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      user_message,
      question,
      include_text
    } = req.query;

    const finalMessage = user_message || question;

    if (!project_code || !session_id || !finalMessage) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and user_message are required.",
        example_url: "/ai/context/build?project_code=rbs_ai_memory&session_id=phase-10-1-test-001&user_message=hello"
      });
    }

    const result = await buildContextPacket({
      project_code,
      session_id,
      user_message: finalMessage,
      include_text: include_text !== "false"
    });

    return res.json(result);
  } catch (error) {
    console.error("Context build GET error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/context/preview", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      question,
      include_prompt,
      include_packet
    } = req.body;

    if (!project_code || !session_id || !question) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required.",
        example: {
          project_code: "rbs_ai_memory",
          session_id: "phase-10-2-preview-test-001",
          question: "Preview the context layers for this question.",
          include_prompt: true,
          include_packet: true
        }
      });
    }

    const result = await buildContextPreview({
      project_code,
      session_id,
      question,
      include_prompt: include_prompt !== false,
      include_packet: include_packet !== false
    });

    return res.json(result);
  } catch (error) {
    console.error("Context preview error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/context/preview", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      question,
      include_prompt,
      include_packet
    } = req.query;

    if (!project_code || !session_id || !question) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required.",
        example_url: "/ai/context/preview?project_code=rbs_ai_memory&session_id=phase-10-2-preview-test-001&question=hello"
      });
    }

    const result = await buildContextPreview({
      project_code,
      session_id,
      question,
      include_prompt: include_prompt !== "false",
      include_packet: include_packet !== "false"
    });

    return res.json(result);
  } catch (error) {
    console.error("Context preview GET error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


// =====================================================
// Phase 10-4: Memory + Recent Buffer + Project Assets Assembly
// =====================================================
router.post("/context/assembly", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      question,
      user_message,
      project_asset_limit,
      recent_buffer_limit,
      summarized_memory_limit,
      max_prompt_chars
    } = req.body;

    if (!project_code || !session_id || !(question || user_message)) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required.",
        example: {
          project_code: "rbs_ai_memory",
          session_id: "phase-10-4-assembly-test-001",
          question: "Build a production context assembly using memory search, recent buffer, and project assets.",
          project_asset_limit: 12,
          recent_buffer_limit: 8,
          summarized_memory_limit: 10
        }
      });
    }

    const result = await buildProductionContextAssembly({
      project_code,
      session_id,
      question,
      user_message,
      project_asset_limit,
      recent_buffer_limit,
      summarized_memory_limit,
      max_prompt_chars
    });

    return res.json(result);
  } catch (error) {
    console.error("Context assembly error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/context/assembly", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      question,
      user_message,
      project_asset_limit,
      recent_buffer_limit,
      summarized_memory_limit,
      max_prompt_chars
    } = req.query;

    if (!project_code || !session_id || !(question || user_message)) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required.",
        example_url: "/ai/context/assembly?project_code=rbs_ai_memory&session_id=phase-10-4-assembly-test-001&question=hello"
      });
    }

    const result = await buildProductionContextAssembly({
      project_code,
      session_id,
      question,
      user_message,
      project_asset_limit,
      recent_buffer_limit,
      summarized_memory_limit,
      max_prompt_chars
    });

    return res.json(result);
  } catch (error) {
    console.error("Context assembly GET error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


router.post("/request-pipeline/draft", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      question,
      include_prompt,
      include_packet,
      dry_run
    } = req.body;

    if (!project_code || !session_id || !question) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required.",
        example: {
          project_code: "rbs_ai_memory",
          session_id: "phase-10-3-pipeline-test-001",
          question: "Create an AI request pipeline draft using memory context.",
          dry_run: true,
          include_prompt: true,
          include_packet: true
        }
      });
    }

    const result = await buildAiRequestPipelineDraft({
      project_code,
      session_id,
      question,
      include_prompt: include_prompt !== false,
      include_packet: include_packet !== false,
      dry_run: dry_run !== false
    });

    return res.json(result);
  } catch (error) {
    console.error("AI request pipeline draft error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/request-pipeline/draft", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      question,
      include_prompt,
      include_packet,
      dry_run
    } = req.query;

    if (!project_code || !session_id || !question) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required.",
        example_url: "/ai/request-pipeline/draft?project_code=rbs_ai_memory&session_id=phase-10-3-pipeline-test-001&question=hello"
      });
    }

    const result = await buildAiRequestPipelineDraft({
      project_code,
      session_id,
      question,
      include_prompt: include_prompt !== "false",
      include_packet: include_packet !== "false",
      dry_run: dry_run !== "false"
    });

    return res.json(result);
  } catch (error) {
    console.error("AI request pipeline draft GET error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/memory/debug-search", async (req, res) => {
  try {
    const { project_code, question } = req.body;

    if (!project_code || !question) {
      return res.status(400).json({
        ok: false,
        error: "project_code and question are required."
      });
    }

    const extractedKeywords = extractKeywords(question);

    const longTermResult = await getLongTermMemory(
      project_code,
      question
    );

    res.json({
      ok: true,
      project_code,
      question,
      extracted_keywords: extractedKeywords,
      selected_memory_count: longTermResult.memories.length,
      selected_memories: longTermResult.memories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        summary: memory.summary,
        tags: memory.tags,
        importance: memory.importance,
        matched_terms: memory.matched_terms || [],
        total_score: memory.total_score || 0,
        best_matched_term: memory.matched_term || null,
        best_match_score: memory.match_score || 0,
        created_at: memory.created_at
      }))
    });
  } catch (error) {
    console.error("Memory debug search error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/system/status", async (req, res) => {
  try {
    const status = await getSystemStatus();
    res.json(status);
  } catch (error) {
    console.error("System status error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


router.get("/system/daily-health-check", adminApiAuthMiddleware, async (req, res) => {
  try {
    const healthCheck = await getDailyHealthCheck();

    const statusCode = healthCheck.ok ? 200 : 500;
    return res.status(statusCode).json(healthCheck);
  } catch (error) {
    console.error("Daily health check error:", error);

    return res.status(500).json({
      ok: false,
      checked_at: new Date().toISOString(),
      overall_status: "ERROR",
      errors: [error.message]
    });
  }
});


router.post("/system/daily-health-check/save", adminApiAuthMiddleware, async (req, res) => {
  try {
    const healthCheck = await getDailyHealthCheck();
    const saved = await saveDailyHealthCheck(healthCheck);

    return res.json({
      ok: true,
      message: "Daily Health Check saved successfully.",
      id: saved.id,
      saved_at: saved.saved_at,
      health_check: saved.health_check
    });
  } catch (error) {
    console.error("Daily health check save error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/system/daily-health-check/history", adminApiAuthMiddleware, async (req, res) => {
  try {
    const rows = await getDailyHealthCheckHistory(req.query.limit || 10);

    return res.json({
      ok: true,
      count: rows.length,
      results: rows
    });
  } catch (error) {
    console.error("Daily health check history error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});



router.get("/system/daily-operation-checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getDailyOperationChecklist(req.query.date || null);
    return res.json(result);
  } catch (error) {
    console.error("Daily operation checklist load error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.patch("/system/daily-operation-checklist/item", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await updateDailyOperationChecklistItem({
      check_date: req.body.check_date || null,
      item_key: req.body.item_key,
      is_done: Boolean(req.body.is_done),
      note: req.body.note || null
    });

    return res.json(result);
  } catch (error) {
    console.error("Daily operation checklist update error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/system/daily-operation-checklist/reset", adminApiAuthMiddleware, requireDangerousAction("RESET_DAILY_OPERATION_CHECKLIST"), async (req, res) => {
  try {
    const result = await resetDailyOperationChecklist(req.body?.check_date || req.query.date || null);
    return res.json(result);
  } catch (error) {
    console.error("Daily operation checklist reset error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


// ======================================================
// Phase 9-5: Daily Operation Automation APIs
// ======================================================
router.get("/system/daily-automation/config", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getDailyAutomationConfig();
    return res.json(result);
  } catch (error) {
    console.error("Daily automation config load error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.patch("/system/daily-automation/config", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await updateDailyAutomationConfig(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("Daily automation config update error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/system/daily-automation/run", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runDailyOperationAutomation({
      run_type: req.body?.run_type || "manual",
      run_date: req.body?.run_date || null
    });

    return res.status(result.ok ? 200 : 500).json(result);
  } catch (error) {
    console.error("Daily automation run error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/system/daily-automation/history", adminApiAuthMiddleware, async (req, res) => {
  try {
    const rows = await getDailyAutomationHistory(req.query.limit || 10);
    return res.json({
      ok: true,
      count: rows.length,
      results: rows
    });
  } catch (error) {
    console.error("Daily automation history error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});



// ======================================================
// Phase 9-6: Operation Logs + Automation Safety APIs
// ======================================================
router.get("/system/daily-automation/safety", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getAutomationSafetyStatus();
    return res.json(result);
  } catch (error) {
    console.error("Daily automation safety status error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/system/daily-automation/unlock", adminApiAuthMiddleware, requireDangerousAction("UNLOCK_AUTOMATION_LOCK"), async (req, res) => {
  try {
    const lockKey = req.body?.lock_key || "daily_operation_automation";
    const result = await releaseSystemOperationLock(lockKey);

    await createOperationLog({
      log_level: "WARNING",
      category: "automation",
      action: "daily_automation_manual_unlock",
      message: `Manual unlock executed for lock_key=${lockKey}. released_count=${result.released_count}`,
      actor: "admin",
      raw: result
    });

    return res.json(result);
  } catch (error) {
    console.error("Daily automation unlock error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/system/operation-logs", adminApiAuthMiddleware, async (req, res) => {
  try {
    const rows = await getOperationLogs({
      limit: req.query.limit || 50,
      log_level: req.query.level || req.query.log_level || null,
      category: req.query.category || null,
      action: req.query.action || null
    });

    return res.json({
      ok: true,
      count: rows.length,
      results: rows
    });
  } catch (error) {
    console.error("Operation logs load error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/system/operation-logs", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await createOperationLog({
      log_level: req.body?.log_level || "INFO",
      category: req.body?.category || "manual",
      action: req.body?.action || "manual_operation_note",
      message: req.body?.message || null,
      actor: req.body?.actor || "admin",
      ref_type: req.body?.ref_type || null,
      ref_id: req.body?.ref_id || null,
      raw: req.body?.raw || null
    });

    return res.json(result);
  } catch (error) {
    console.error("Operation log create error:", error);
    return res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/system/operation-logs/cleanup", adminApiAuthMiddleware, requireDangerousAction("CLEANUP_OPERATION_LOGS"), async (req, res) => {
  try {
    const result = await cleanupOperationLogs({
      older_than_days: req.body?.older_than_days || req.query.older_than_days || 30,
      level: req.body?.level || req.query.level || null
    });

    return res.json(result);
  } catch (error) {
    console.error("Operation logs cleanup error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/memory/save", adminApiAuthMiddleware, async (req, res, next) => {
  try {
    const {
      project_code,
      source_ai,
      memory_type,
      title,
      summary,
      detail,
      tags,
      importance,
      status
    } = req.body;

    if (!project_code || !title || !summary) {
      return res.status(400).json({
        ok: false,
        error: "project_code, title, and summary are required."
      });
    }

    const saved = await saveManualMemory({
      project_code,
      source_ai: source_ai || "manual",
      memory_type: memory_type || "manual_note",
      title,
      summary,
      detail: detail || null,
      tags: tags || null,
      importance: importance || 3,
      status: status || "active"
    });

    res.json({
      ok: true,
      message: "Manual memory saved successfully.",
      memory: saved
    });
  } catch (error) {
    console.error("Manual memory save error:", error);

    res.status(error.statusCode || 500).json({
      ok: false,
      error: {
        code: error.code || "MEMORY_SAVE_ERROR",
        message: error.message
      }
    });
  }
});

router.patch("/memory/:id/status", adminApiAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || !status) {
      return res.status(400).json({
        ok: false,
        error: "id and status are required."
      });
    }

    const result = await updateMemoryStatus({
      id,
      status
    });

    res.json({
      ok: true,
      message: "Memory status updated successfully.",
      result
    });
  } catch (error) {
    console.error("Memory status update error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/project/assets", adminApiAuthMiddleware, async (req, res, next) => {
  try {
    const {
      project_code,
      asset_type,
      title,
      content,
      priority,
      is_active
    } = req.body;

    if (!project_code || !asset_type || !title || !content) {
      return res.status(400).json({
        ok: false,
        error: "project_code, asset_type, title, and content are required."
      });
    }

    const asset = await createProjectAsset({
      project_code,
      asset_type,
      title,
      content,
      priority: priority || 3,
      is_active: is_active === undefined ? true : is_active
    });

    res.json({
      ok: true,
      message: "Project asset created successfully.",
      asset
    });
  } catch (error) {
    console.error("Project asset create error:", error);

    res.status(error.statusCode || 500).json({
      ok: false,
      error: {
        code: error.code || "PROJECT_ASSET_CREATE_ERROR",
        message: error.message
      }
    });
  }
});

router.patch("/project/assets/:id", adminApiAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "id is required."
      });
    }

    const result = await updateProjectAsset({
      id,
      asset_type: req.body.asset_type,
      title: req.body.title,
      content: req.body.content,
      priority: req.body.priority,
      is_active: req.body.is_active
    });

    res.json({
      ok: true,
      message: "Project asset updated successfully.",
      result
    });
  } catch (error) {
    console.error("Project asset update error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/summary/retry-failed", adminApiAuthMiddleware, async (req, res, next) => {
  try {
    const { limit, ids } = req.body || {};

    const result = await retryFailedSummaryQueue({
      limit: limit || 10,
      ids: Array.isArray(ids) ? ids : null
    });

    res.json({
      ok: true,
      message: "Failed summary queue items moved back to pending.",
      result
    });
  } catch (error) {
    console.error("Retry failed summary queue error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/summary/retry-one", adminApiAuthMiddleware, async (req, res) => {
  try {
    // Accept id from JSON body first. Query string is also accepted for quick Postman tests.
    const rawId = (req.body && (req.body.id || req.body.queue_id)) || req.query.id || req.query.queue_id;
    const id = Number(rawId);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Valid queue id is required.",
        example: { id: 1 },
        postman_body: { mode: "raw", type: "JSON", value: '{ "id": 1 }' }
      });
    }

    const result = await retrySummaryQueueItem({ id });

    res.json({
      ok: true,
      message: "Selected failed summary queue item moved back to pending.",
      result
    });
  } catch (error) {
    console.error("Retry one summary queue error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/summary/retry-selected", adminApiAuthMiddleware, async (req, res) => {
  try {
    const { ids } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "ids array is required."
      });
    }

    const result = await retryFailedSummaryQueue({ ids });

    res.json({
      ok: true,
      message: "Selected failed summary queue items moved back to pending.",
      result
    });
  } catch (error) {
    console.error("Retry selected summary queue error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/summary/reset-stuck-processing", adminApiAuthMiddleware, requireDangerousAction("RESET_STUCK_PROCESSING_QUEUE"), async (req, res) => {
  try {
    const { older_than_minutes, limit } = req.body || {};

    const result = await resetStuckProcessingQueue({
      older_than_minutes: older_than_minutes || 30,
      limit: limit || 20
    });

    res.json({
      ok: true,
      message: "Stuck processing summary queue items moved back to pending.",
      result
    });
  } catch (error) {
    console.error("Reset stuck processing summary queue error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/summary/queue-stats", adminApiAuthMiddleware, async (req, res) => {
  try {
    const results = await getSummaryQueueStats();

    res.json({
      ok: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error("Summary queue stats error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});



router.get("/summary/worker-status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getSummaryWorkerStatus({
      project_code: req.query.project_code || null,
      recent_limit: req.query.limit || 10
    });
    return res.json(result);
  } catch (error) {
    console.error("Summary worker status error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/summary/integration-status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getSummaryIntegrationStatus({
      project_code: req.query.project_code || null,
      session_id: req.query.session_id || null,
      limit: req.query.limit || 10
    });
    return res.json(result);
  } catch (error) {
    console.error("Summary integration status error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/summary/process-batch", adminApiAuthMiddleware, async (req, res) => {
  try {
    const { limit, project_code } = req.body || {};
    const result = await processSummaryQueueBatch({
      limit: limit || 5,
      project_code: project_code || null,
      source: "admin_console"
    });
    return res.json(result);
  } catch (error) {
    console.error("Summary process batch error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/summary/drain", adminApiAuthMiddleware, requireDangerousAction("DRAIN_SUMMARY_QUEUE"), async (req, res) => {
  try {
    const { limit_per_batch, max_batches, project_code } = req.body || {};
    const result = await drainPendingSummaryQueue({
      limit_per_batch: limit_per_batch || 5,
      max_batches: max_batches || 3,
      project_code: project_code || null
    });
    return res.json(result);
  } catch (error) {
    console.error("Summary drain error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/summary/queue", adminApiAuthMiddleware, async (req, res) => {
  try {
    const { status, project_code, limit } = req.query;

    const results = await getSummaryQueue({
      status: status || null,
      project_code: project_code || null,
      limit: limit || 20
    });

    res.json({
      ok: true,
      count: results.length,
      filters: {
        status: status || null,
        project_code: project_code || null,
        limit: Number(limit || 20)
      },
      results
    });
  } catch (error) {
    console.error("Summary queue list error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});



router.get("/system/operation-report/summary", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getOperationReportSummary({
      report_date: req.query.date || null
    });

    res.json(result);
  } catch (error) {
    console.error("Operation report summary error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


router.get("/system/phase9-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getPhase9FinalDecision({
      report_date: req.query.date || null
    });
    return res.json(result);
  } catch (error) {
    console.error("Phase 9 final decision error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/system/phase9-final-checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getPhase9FinalChecklist();
    res.json(result);
  } catch (error) {
    console.error("Phase 9 final checklist error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.patch("/system/phase9-final-checklist/item", adminApiAuthMiddleware, async (req, res) => {
  try {
    const { item_key, is_done, note } = req.body;

    if (!item_key) {
      return res.status(400).json({
        ok: false,
        error: "item_key is required."
      });
    }

    const result = await updatePhase9FinalChecklistItem({
      item_key,
      is_done: Boolean(is_done),
      note: note || null
    });

    res.json(result);
  } catch (error) {
    console.error("Phase 9 final checklist update error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/system/phase9-final-checklist/reset", adminApiAuthMiddleware, requireDangerousAction("RESET_PHASE9_FINAL_CHECKLIST"), async (req, res) => {
  try {
    const result = await resetPhase9FinalChecklist();
    res.json(result);
  } catch (error) {
    console.error("Phase 9 final checklist reset error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/memory/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "id is required."
      });
    }

    const result = await getMemoryById({ id });

    if (!result) {
      return res.status(404).json({
        ok: false,
        error: "Memory not found."
      });
    }

    res.json({
      ok: true,
      memory: result.memory,
      linked_conversations_count: result.linked_conversations.length,
      linked_conversations: result.linked_conversations
    });
  } catch (error) {
    console.error("Memory detail error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/conversation/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "id is required."
      });
    }

    const result = await getConversationById({ id });

    if (!result) {
      return res.status(404).json({
        ok: false,
        error: "Conversation not found."
      });
    }

    res.json({
      ok: true,
      conversation: result.conversation,
      linked_memories_count: result.linked_memories.length,
      linked_memories: result.linked_memories
    });
  } catch (error) {
    console.error("Conversation detail error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


router.post("/response/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      user_id,
      question,
      save_to_memory,
      include_prompt,
      include_packet,
      use_assembly,
      recent_buffer_keep_limit,
      create_summary_queue,
      use_provider_router,
      intent,
      preferred_provider,
      force_provider,
      model_name,
      live,
      allow_fallback,
      require_live
    } = req.body;

    if (!project_code || !session_id || !question) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required.",
        example: {
          project_code: "rbs_ai_memory",
          session_id: "phase-10-5-response-test-001",
          question: "Test an AI response with memory context.",
          save_to_memory: true,
          include_prompt: true,
          include_packet: false
        }
      });
    }

    const result = await runMemoryContextResponseTest({
      project_code,
      session_id,
      user_id,
      question,
      save_to_memory,
      include_prompt,
      include_packet,
      use_assembly,
      recent_buffer_keep_limit,
      create_summary_queue,
      use_provider_router,
      intent,
      preferred_provider,
      force_provider,
      model_name,
      live,
      allow_fallback,
      require_live
    });

    return res.json(result);
  } catch (error) {
    console.error("Memory context response test error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/response/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const {
      project_code,
      session_id,
      user_id,
      question,
      save_to_memory,
      include_prompt,
      include_packet,
      use_assembly,
      recent_buffer_keep_limit,
      create_summary_queue,
      use_provider_router,
      intent,
      preferred_provider,
      force_provider,
      model_name,
      live,
      allow_fallback,
      require_live
    } = req.query;

    if (!project_code || !session_id || !question) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required.",
        example_url: "/ai/response/test?project_code=rbs_ai_memory&session_id=phase-10-5-response-test-001&question=hello"
      });
    }

    const result = await runMemoryContextResponseTest({
      project_code,
      session_id,
      user_id,
      question,
      save_to_memory,
      include_prompt,
      include_packet,
      use_assembly,
      recent_buffer_keep_limit,
      create_summary_queue,
      use_provider_router,
      intent,
      preferred_provider,
      force_provider,
      model_name,
      live,
      allow_fallback,
      require_live
    });

    return res.json(result);
  } catch (error) {
    console.error("Memory context response test GET error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});



router.get("/response/storage/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const { project_code, session_id, limit } = req.query;

    if (!project_code || !session_id) {
      return res.status(400).json({
        ok: false,
        error: "project_code and session_id are required.",
        example_url: "/ai/response/storage/status?project_code=rbs_ai_memory&session_id=phase-10-5-response-test-001&limit=10"
      });
    }

    const result = await getResponseStorageStatus({
      project_code,
      session_id,
      limit
    });

    return res.json(result);
  } catch (error) {
    console.error("Response storage status error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/response/storage/cleanup", adminApiAuthMiddleware, requireDangerousAction("CLEANUP_RESPONSE_BUFFER"), async (req, res) => {
  try {
    const { session_id, keep_limit } = req.body || {};

    if (!session_id) {
      return res.status(400).json({
        ok: false,
        error: "session_id is required.",
        example: {
          session_id: "phase-10-5-response-test-001",
          keep_limit: 10
        }
      });
    }

    const result = await cleanupRecentBuffer(session_id, keep_limit || 10);

    return res.json({
      ok: true,
      message: "Recent buffer cleanup completed.",
      result
    });
  } catch (error) {
    console.error("Response storage cleanup error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/context/rebuild", adminApiAuthMiddleware, async (req, res, next) => {
  try {
    const {
      project_code,
      session_id,
      question,
      include_prompt
    } = req.body;

    if (!project_code || !session_id || !question) {
      return res.status(400).json({
        ok: false,
        error: "project_code, session_id, and question are required."
      });
    }

    const context = await buildContext({
      project_code,
      session_id,
      question
    });

    const finalPrompt = await buildPrompt({
      question,
      context
    });

    res.json({
      ok: true,
      mode: "context_rebuild",
      project_code,
      session_id,
      question,
      prompt_length: finalPrompt.length,
      context_summary: {
        project_assets_count: context.projectAssets.length,
        recent_buffer_count: context.recentBuffer.length,
        long_term_memory_count: context.longTermMemory.length,
        extracted_keywords: context.extractedKeywords,
        limits: context.limits
      },
      selected_memories: context.longTermMemory.map((memory) => ({
        id: memory.id,
        title: memory.title,
        memory_type: memory.memory_type,
        importance: memory.importance,
        matched_terms: memory.matched_terms || [],
        total_score: memory.total_score || 0,
        created_at: memory.created_at
      })),
      grouped_assets_summary: {
        persona: context.groupedAssets.persona.length,
        rule: context.groupedAssets.rule.length,
        vocabulary: context.groupedAssets.vocabulary.length,
        reference_doc: context.groupedAssets.reference_doc.length,
        formatting: context.groupedAssets.formatting.length,
        workflow: context.groupedAssets.workflow.length,
        other: context.groupedAssets.other.length
      },
      final_prompt: include_prompt === false ? undefined : finalPrompt
    });
  } catch (error) {
    console.error("Context rebuild error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/project/list", async (req, res) => {
  try {
    const { status } = req.query;

    const projects = await getProjectList({
      status: status || null
    });

    res.json({
      ok: true,
      count: projects.length,
      filters: {
        status: status || null
      },
      projects
    });
  } catch (error) {
    console.error("Project list error:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


router.get("/system/phase10-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runPhase10FinalDecision({
      project_code: req.query.project_code || "rbs_ai_memory",
      session_id: req.query.session_id || "phase-10-final-decision-test",
      question: req.query.question || "Phase 10 Final에서 실제 AI 응답 파이프라인 완료 여부를 점검합니다.",
      run_response_smoke_test: req.query.run_response_smoke_test,
      save_smoke_test_to_memory: req.query.save_smoke_test_to_memory,
      process_summary_batch: req.query.process_summary_batch,
      summary_batch_limit: req.query.summary_batch_limit
    });

    return res.json(result);
  } catch (error) {
    console.error("Phase 10 final decision error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/system/phase10-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runPhase10FinalDecision(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("Phase 10 final decision error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


router.get("/system/phase10-completion-report", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getPhase10CompletionReport({
      project_code: req.query.project_code || "rbs_ai_memory",
      session_id: req.query.session_id || "phase-10-final-decision-test",
      question: req.query.question || "Phase 10 completion report check.",
      run_response_smoke_test: req.query.run_response_smoke_test,
      save_smoke_test_to_memory: req.query.save_smoke_test_to_memory,
      process_summary_batch: req.query.process_summary_batch,
      summary_batch_limit: req.query.summary_batch_limit
    });

    return res.json(result);
  } catch (error) {
    console.error("Phase 10 completion report error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/system/phase10-completion-report", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getPhase10CompletionReport(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("Phase 10 completion report error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


// ======================================================
// Phase 11-1: Multi-model Provider Interface
// ======================================================
router.get("/model/providers", adminApiAuthMiddleware, async (req, res) => {
  try {
    const providers = await getProviderCatalog();

    return res.json({
      ok: true,
      phase: "11-1",
      count: providers.length,
      providers
    });
  } catch (error) {
    console.error("Model providers error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/model/profiles/normalized", adminApiAuthMiddleware, async (req, res) => {
  try {
    const includeInactive =
      req.query.include_inactive === "true" ||
      req.query.include_inactive === "1" ||
      req.query.include_inactive === true;

    const profiles = await listNormalizedModelProfiles({
      provider: req.query.provider || null,
      include_inactive: includeInactive
    });

    const columns = await getModelProfileColumns();

    return res.json({
      ok: true,
      phase: "11-1",
      count: profiles.length,
      columns,
      filters: {
        provider: req.query.provider || null,
        include_inactive: includeInactive
      },
      profiles
    });
  } catch (error) {
    console.error("Normalized model profiles error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/model/profile/normalize", adminApiAuthMiddleware, async (req, res) => {
  try {
    const normalized = normalizeModelProfile(req.body || {});

    return res.json({
      ok: true,
      phase: "11-1",
      normalized_profile: normalized
    });
  } catch (error) {
    console.error("Normalize model profile error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/model/provider/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await testProviderAdapter({
      provider: req.body?.provider || "mock",
      model_name: req.body?.model_name || null,
      prompt: req.body?.prompt || "Phase 11-1 provider adapter test.",
      live: req.body?.live === true || req.body?.live === "true" || req.body?.live === 1
    });

    return res.json(result);
  } catch (error) {
    console.error("Provider adapter test error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


// ======================================================
// Phase 11-2: OpenAI Live Provider Safety Gate
// ======================================================
router.get("/model/openai/live-status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getOpenAiLiveStatus();
    return res.json(result);
  } catch (error) {
    console.error("OpenAI live status error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


router.get("/model/openai/available-models", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await listOpenAiAvailableModels({
      limit: Number(req.query.limit || 100)
    });

    return res.status(result.ok === false ? 400 : 200).json(result);
  } catch (error) {
    console.error("OpenAI available models error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/model/openai/live-test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await testOpenAiLiveProvider({
      model_name: req.body?.model_name || null,
      prompt: req.body?.prompt || "Phase 11-2 OpenAI live provider safety test.",
      live: req.body?.live === true || req.body?.live === "true" || req.body?.live === 1
    });

    const statusCode = result.ok === false ? 400 : 200;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error("OpenAI live test error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
      safety: error.safety || null
    });
  }
});


// ======================================================
// Phase 11-3: Anthropic / Claude Live Provider Safety Gate
// ======================================================
router.get("/model/anthropic/live-status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getAnthropicLiveStatus();
    return res.json(result);
  } catch (error) {
    console.error("Anthropic live status error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/model/anthropic/available-models", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await listAnthropicAvailableModels({
      limit: Number(req.query.limit || 100)
    });

    return res.status(result.ok === false ? 400 : 200).json(result);
  } catch (error) {
    console.error("Anthropic available models error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/model/anthropic/live-test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await testAnthropicLiveProvider({
      model_name: req.body?.model_name || null,
      prompt: req.body?.prompt || "Phase 11-3 Anthropic live provider safety test.",
      live: req.body?.live === true || req.body?.live === "true" || req.body?.live === 1
    });

    const statusCode = result.ok === false ? 400 : 200;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error("Anthropic live test error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
      safety: error.safety || null
    });
  }
});


// ======================================================
// Phase 11-4: Gemini / Google Live Provider Safety Gate
// ======================================================
router.get("/model/gemini/live-status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getGeminiLiveStatus();
    return res.json(result);
  } catch (error) {
    console.error("Gemini live status error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/model/gemini/available-models", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await listGeminiAvailableModels({
      limit: Number(req.query.limit || 100)
    });

    return res.status(result.ok === false ? 400 : 200).json(result);
  } catch (error) {
    console.error("Gemini available models error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/model/gemini/live-test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await testGeminiLiveProvider({
      model_name: req.body?.model_name || null,
      prompt: req.body?.prompt || "Phase 11-4 Gemini live provider safety test.",
      live: req.body?.live === true || req.body?.live === "true" || req.body?.live === 1
    });

    const statusCode = result.ok === false ? 400 : 200;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error("Gemini live test error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
      safety: error.safety || null
    });
  }
});


// ======================================================
// Phase 11-5: Provider Router Advanced Selection Rules
// ======================================================
router.get("/model/router/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getProviderRouterStatus();
    return res.json(result);
  } catch (error) {
    console.error("Provider router status error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/model/router/rules", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = getProviderRoutingRules();
    return res.json(result);
  } catch (error) {
    console.error("Provider router rules error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/model/router/select", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await selectProviderRoute({
      intent: req.body?.intent || "general",
      preferred_provider: req.body?.preferred_provider || null,
      force_provider: req.body?.force_provider || null,
      model_name: req.body?.model_name || null,
      prompt: req.body?.prompt || "",
      live: req.body?.live === true || req.body?.live === "true" || req.body?.live === 1,
      require_live: req.body?.require_live,
      allow_fallback: req.body?.allow_fallback !== false
    });

    return res.json(result);
  } catch (error) {
    console.error("Provider router select error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post("/model/router/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await testProviderRouter({
      intent: req.body?.intent || "general",
      preferred_provider: req.body?.preferred_provider || null,
      force_provider: req.body?.force_provider || null,
      model_name: req.body?.model_name || null,
      prompt: req.body?.prompt || "Phase 11-5 provider router test.",
      live: req.body?.live === true || req.body?.live === "true" || req.body?.live === 1,
      require_live: req.body?.require_live,
      allow_fallback: req.body?.allow_fallback !== false,
      execute_test: req.body?.execute_test === true || req.body?.execute_test === "true" || req.body?.execute_test === 1
    });

    return res.json(result);
  } catch (error) {
    console.error("Provider router test error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


// ======================================================
// Phase 11-7: Multi-provider Fallback Test + Phase 11 Final Preparation
// ======================================================
router.get("/model/router/fallback-scenarios", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = getFallbackScenarioDefinitions();
    return res.json(result);
  } catch (error) {
    console.error("Provider fallback scenarios error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/model/router/fallback-test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runProviderFallbackTest({
      intent: req.body?.intent || "general",
      preferred_provider: req.body?.preferred_provider || null,
      force_provider: req.body?.force_provider || null,
      model_name: req.body?.model_name || null,
      prompt: req.body?.prompt || "Phase 11-7 provider fallback test.",
      live: req.body?.live === true || req.body?.live === "true" || req.body?.live === 1,
      require_live: req.body?.require_live,
      allow_fallback: req.body?.allow_fallback !== false,
      blocked_providers: req.body?.blocked_providers || req.body?.simulate_unavailable_providers || [],
      execute_test: req.body?.execute_test === true || req.body?.execute_test === "true" || req.body?.execute_test === 1
    });
    return res.json(result);
  } catch (error) {
    console.error("Provider fallback test error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/model/router/fallback-matrix", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runProviderFallbackMatrix({
      execute_test: req.body?.execute_test === true || req.body?.execute_test === "true" || req.body?.execute_test === 1,
      live: req.body?.live === true || req.body?.live === "true" || req.body?.live === 1
    });
    return res.json(result);
  } catch (error) {
    console.error("Provider fallback matrix error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/system/phase11-final-prep", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getPhase11FinalPreparation({
      run_fallback_matrix: req.query?.run_fallback_matrix === "true" || req.query?.run_fallback_matrix === "1",
      execute_test: req.query?.execute_test === "true" || req.query?.execute_test === "1"
    });
    return res.json(result);
  } catch (error) {
    console.error("Phase 11 final preparation error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/system/phase11-final-prep", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getPhase11FinalPreparation({
      run_fallback_matrix: req.body?.run_fallback_matrix === true || req.body?.run_fallback_matrix === "true" || req.body?.run_fallback_matrix === 1,
      execute_test: req.body?.execute_test === true || req.body?.execute_test === "true" || req.body?.execute_test === 1
    });
    return res.json(result);
  } catch (error) {
    console.error("Phase 11 final preparation error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});


// ======================================================
// Phase 11 Final: Multi-model Provider Completion Decision
// ======================================================
router.get("/system/phase11-completion-checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = getPhase11CompletionChecklist();
    return res.json(result);
  } catch (error) {
    console.error("Phase 11 completion checklist error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/system/phase11-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runPhase11FinalDecision({
      project_code: req.query?.project_code || "rbs_ai_memory",
      session_id: req.query?.session_id || "phase-11-final-smoke-test",
      user_id: req.query?.user_id || "admin-final-check",
      question: req.query?.question || "Phase 11 Final routed multi-provider response smoke test.",
      run_response_smoke_test: req.query?.run_response_smoke_test === "true" || req.query?.run_response_smoke_test === "1",
      save_smoke_test_to_memory: req.query?.save_smoke_test_to_memory === "true" || req.query?.save_smoke_test_to_memory === "1",
      process_summary_batch: req.query?.process_summary_batch === "true" || req.query?.process_summary_batch === "1",
      execute_fallback_matrix: req.query?.execute_fallback_matrix === "true" || req.query?.execute_fallback_matrix === "1",
      live: req.query?.live === "true" || req.query?.live === "1",
      preferred_provider: req.query?.preferred_provider || "mock",
      intent: req.query?.intent || "reasoning"
    });
    return res.json(result);
  } catch (error) {
    console.error("Phase 11 final decision GET error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/system/phase11-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await runPhase11FinalDecision({
      project_code: body.project_code || "rbs_ai_memory",
      session_id: body.session_id || "phase-11-final-smoke-test",
      user_id: body.user_id || "admin-final-check",
      question: body.question || "Phase 11 Final routed multi-provider response smoke test.",
      run_response_smoke_test: body.run_response_smoke_test === true || body.run_response_smoke_test === "true" || body.run_response_smoke_test === 1,
      save_smoke_test_to_memory: body.save_smoke_test_to_memory === true || body.save_smoke_test_to_memory === "true" || body.save_smoke_test_to_memory === 1,
      process_summary_batch: body.process_summary_batch === true || body.process_summary_batch === "true" || body.process_summary_batch === 1,
      execute_fallback_matrix: body.execute_fallback_matrix === true || body.execute_fallback_matrix === "true" || body.execute_fallback_matrix === 1,
      live: body.live === true || body.live === "true" || body.live === 1,
      preferred_provider: body.preferred_provider || "mock",
      intent: body.intent || "reasoning"
    });
    return res.json(result);
  } catch (error) {
    console.error("Phase 11 final decision POST error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});


// ======================================================
// Phase 12-1: Admin API Security Hardening + Token Rotation
// ======================================================
router.get("/security/admin/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const status = getAdminSecurityStatus();
    return res.json({
      ...status,
      current_request: {
        token_label: req.adminAuth?.token_label || null,
        token_source: req.adminAuth?.token_source || null,
        token_fingerprint: req.adminAuth?.token_fingerprint || null
      }
    });
  } catch (error) {
    console.error("Admin security status error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/security/admin/events", adminApiAuthMiddleware, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const result = await getAdminSecurityEvents(limit);
    return res.json(result);
  } catch (error) {
    console.error("Admin security events error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ======================================================
// Phase 12-2: Role-based Admin Permission Structure
// ======================================================
router.get("/security/admin/permissions/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getPermissionStatus(req));
  } catch (error) {
    console.error("Admin permission status error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/security/admin/permissions/roles", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getRolesMatrix());
  } catch (error) {
    console.error("Admin permission roles error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/security/admin/permissions/policies", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getPermissionPolicies());
  } catch (error) {
    console.error("Admin permission policies error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/security/admin/permissions/check", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await checkAdminPermission({
      req,
      role: req.body?.role,
      permission: req.body?.permission
    });
    return res.json(result);
  } catch (error) {
    console.error("Admin permission check error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/security/admin/permissions/events", adminApiAuthMiddleware, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const result = await getAdminPermissionEvents(limit);
    return res.json(result);
  } catch (error) {
    console.error("Admin permission events error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// =====================================================
// Phase 12-3: Dangerous Action Confirmation + Permission Enforcement
// =====================================================
router.get("/security/dangerous-actions/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getDangerousActionStatus(req);
    return res.json(result);
  } catch (error) {
    console.error("Dangerous action status error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/security/dangerous-actions/catalog", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = getDangerousActionCatalog();
    return res.json(result);
  } catch (error) {
    console.error("Dangerous action catalog error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/security/dangerous-actions/validate", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await validateDangerousActionRequest({
      req,
      action_key: req.body?.action_key || req.body?.confirm_action || req.query.action_key
    });
    return res.status(result.ok ? 200 : (result.http_status || 400)).json(result);
  } catch (error) {
    console.error("Dangerous action validate error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/security/dangerous-actions/events", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getDangerousActionEvents(req.query.limit || 50);
    return res.json(result);
  } catch (error) {
    console.error("Dangerous action events error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post(
  "/security/dangerous-actions/test-confirmation",
  adminApiAuthMiddleware,
  requireDangerousAction("TEST_DANGEROUS_CONFIRMATION"),
  async (req, res) => {
    return res.json({
      ok: true,
      phase: "12-3",
      message: "Dangerous action confirmation and permission enforcement test passed.",
      dangerous_action: req.dangerousAction
    });
  }
);


// ======================================================
// Phase 13-5: System Monitoring Dashboard
// ======================================================
router.get("/monitoring/system", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getSystemMonitoringDashboard();
    return res.json(result);
  } catch (error) {
    console.error("System monitoring dashboard error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "system-monitoring.routes" });
  }
});

router.get("/monitoring/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = getSystemMonitoringChecklist();
    return res.json(result);
  } catch (error) {
    console.error("System monitoring checklist error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "system-monitoring.routes" });
  }
});

router.post("/monitoring/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runSystemMonitoringTest(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("System monitoring test error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "system-monitoring.routes" });
  }
});

router.get("/monitoring/detailed", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getDetailedResourceMonitoring();
    return res.json(result);
  } catch (error) {
    console.error("Detailed resource monitoring error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "resource-monitoring.routes" });
  }
});

router.get("/monitoring/worker-status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getWorkerMonitoringStatus();
    return res.json(result);
  } catch (error) {
    console.error("Worker monitoring status error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "resource-monitoring.routes" });
  }
});

router.get("/monitoring/resource-checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = getResourceMonitoringChecklist();
    return res.json(result);
  } catch (error) {
    console.error("Resource monitoring checklist error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "resource-monitoring.routes" });
  }
});

router.post("/monitoring/detailed/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runDetailedMonitoringTest(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("Detailed monitoring test error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "resource-monitoring.routes" });
  }
});

// ======================================================
// Phase 13-7: Alert Rules Preparation
// ======================================================
router.get("/monitoring/alerts/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getAlertRulesStatus();
    return res.json(result);
  } catch (error) {
    console.error("Alert rules status error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "alert-rules.routes" });
  }
});

router.get("/monitoring/alerts/catalog", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = getAlertRulesCatalog();
    return res.json(result);
  } catch (error) {
    console.error("Alert rules catalog error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "alert-rules.routes" });
  }
});

router.get("/monitoring/alerts/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = getAlertRulesChecklist();
    return res.json(result);
  } catch (error) {
    console.error("Alert rules checklist error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "alert-rules.routes" });
  }
});

router.post("/monitoring/alerts/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runAlertRulesTest(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("Alert rules test error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "alert-rules.routes" });
  }
});


router.get("/system/phase13-completion-checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getPhase13CompletionChecklist();
    return res.json(result);
  } catch (error) {
    console.error("Phase 13 completion checklist error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase13-final.routes" });
  }
});

router.get("/system/phase13-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runPhase13FinalDecision();
    return res.json(result);
  } catch (error) {
    console.error("Phase 13 final decision error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase13-final.routes" });
  }
});

router.post("/system/phase13-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runPhase13FinalDecision(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("Phase 13 final decision error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase13-final.routes" });
  }
});

router.post("/system/phase13-final-test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runPhase13FinalTest(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("Phase 13 final test error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase13-final.routes" });
  }
});


// ======================================================
// Phase 14-1: Full System Smoke Test
// ======================================================
router.get("/system/phase14-smoke-status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getPhase14SmokeStatus();
    return res.json(result);
  } catch (error) {
    console.error("Phase 14 smoke status error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-smoke.routes" });
  }
});

router.get("/system/phase14-smoke-checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getPhase14SmokeChecklist();
    return res.json(result);
  } catch (error) {
    console.error("Phase 14 smoke checklist error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-smoke.routes" });
  }
});

router.post("/system/phase14-smoke-test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runPhase14SmokeTest(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("Phase 14 smoke test error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-smoke.routes" });
  }
});

// ======================================================
// Phase 14-2: Production Admin Menu Cleanup
// ======================================================
router.get("/system/phase14-menu-cleanup/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getProductionMenuCleanupStatus();
    return res.json(result);
  } catch (error) {
    console.error("Phase 14 menu cleanup status error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-menu-cleanup.routes" });
  }
});

router.get("/system/phase14-menu-cleanup/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await getProductionMenuCleanupChecklist();
    return res.json(result);
  } catch (error) {
    console.error("Phase 14 menu cleanup checklist error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-menu-cleanup.routes" });
  }
});

router.post("/system/phase14-menu-cleanup/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const result = await runProductionMenuCleanupTest(req.body || {});
    return res.json(result);
  } catch (error) {
    console.error("Phase 14 menu cleanup test error:", error);
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-menu-cleanup.routes" });
  }
});

router.get("/assets/types", async (req, res) => {
  try {
    const assetTypes = [
      {
        value: "persona",
        label: "Persona",
        description: "Defines the AI role, tone, and expert identity for a project."
      },
      {
        value: "rule",
        label: "Rule",
        description: "Defines strict instructions and operating rules the AI must follow."
      },
      {
        value: "vocabulary",
        label: "Vocabulary",
        description: "Defines project-specific terms, abbreviations, and naming conventions."
      },
      {
        value: "reference_doc",
        label: "Reference Document",
        description: "Stores important reference notes, roadmap, or project background."
      },
      {
        value: "formatting",
        label: "Formatting",
        description: "Defines the preferred response format, tables, steps, or code style."
      },
      {
        value: "workflow",
        label: "Workflow",
        description: "Defines the step-by-step process the AI should follow."
      }
    ];

    return success(res, {
      message: "Asset types loaded successfully.",
      data: {
        asset_types: assetTypes
      },
      meta: {
        count: assetTypes.length
      }
    });
  } catch (error) {
    console.error("Asset types error:", error);

    return fail(res, {
      code: "ASSET_TYPES_ERROR",
      message: error.message
    });
  }
});


// ======================================================
// Phase 15-2: ChatGPT Export ZIP Importer
// ======================================================
const chatgptExportImporterService = require("../services/chatgpt-export-importer.service");

router.get("/imports/chatgpt/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await chatgptExportImporterService.getChatGPTImporterStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-chatgpt-importer.routes" });
  }
});

router.get("/imports/chatgpt/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const status = await chatgptExportImporterService.getChatGPTImporterStatus();
    return res.json({
      ok: status.ok,
      phase: "15-2",
      checked_at: new Date().toISOString(),
      checklist_status: status.importer_status,
      checklist: status.checklist,
      dependency: status.dependency,
      latest_chatgpt_batch: status.latest_chatgpt_batch
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-chatgpt-importer.routes" });
  }
});

router.post("/imports/chatgpt/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await chatgptExportImporterService.runChatGPTImporterTest(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-chatgpt-importer.routes" });
  }
});

router.post("/imports/chatgpt/import", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await chatgptExportImporterService.importChatGPTExportFromZip(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-chatgpt-importer.routes" });
  }
});

module.exports = router;
// ======================================================
// Phase 14-3: Dev / Diagnostic Menu Final Hide Policy
// ======================================================
router.get("/system/phase14-dev-menu-final/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getDevMenuPolicy());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-dev-menu-final.routes" });
  }
});

router.get("/system/phase14-dev-menu-final/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(getDevMenuFinalChecklist());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-dev-menu-final.routes" });
  }
});

router.post("/system/phase14-dev-menu-final/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    const scenario = req.body?.scenario || "current";
    return res.json(testDevMenuFinalPolicy(scenario));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-dev-menu-final.routes" });
  }
});

// ======================================================
// Phase 14-4: Operator Manual Final
// ======================================================
const operatorManualService = require("../services/operator-manual.service");

router.get("/system/phase14-operator-manual/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(operatorManualService.getOperatorManualStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-operator-manual.routes" });
  }
});

router.get("/system/phase14-operator-manual/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(operatorManualService.getOperatorManualChecklist());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-operator-manual.routes" });
  }
});

router.post("/system/phase14-operator-manual/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(operatorManualService.testOperatorManual());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-operator-manual.routes" });
  }
});


// ======================================================
// Phase 14-5: Server & Worker Runbook
// ======================================================
const phase14RunbookService = require("../services/phase14-runbook.service");

router.get("/system/phase14-runbook/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14RunbookService.getRunbookStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-runbook.routes" });
  }
});

router.get("/system/phase14-runbook/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14RunbookService.getRunbookChecklist());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-runbook.routes" });
  }
});

router.post("/system/phase14-runbook/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14RunbookService.testRunbook());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-runbook.routes" });
  }
});

// ======================================================
// Phase 14-6: Final Deployment Checklist
// ======================================================
const phase14FinalDeploymentService = require("../services/phase14-final-deployment.service");

router.get("/system/phase14-final-deployment/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14FinalDeploymentService.getFinalDeploymentStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-final-deployment.routes" });
  }
});

router.get("/system/phase14-final-deployment/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14FinalDeploymentService.getFinalDeploymentChecklist());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-final-deployment.routes" });
  }
});

router.post("/system/phase14-final-deployment/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14FinalDeploymentService.runFinalDeploymentTest(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-final-deployment.routes" });
  }
});


// ======================================================
// Phase 14-7: Project Completion Report
// ======================================================
const phase14ProjectCompletionService = require("../services/phase14-project-completion.service");

router.get("/system/phase14-project-completion/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14ProjectCompletionService.getProjectCompletionStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-project-completion.routes" });
  }
});

router.get("/system/phase14-project-completion/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14ProjectCompletionService.getProjectCompletionChecklist());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-project-completion.routes" });
  }
});

router.post("/system/phase14-project-completion/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14ProjectCompletionService.testProjectCompletion());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-project-completion.routes" });
  }
});

// ======================================================
// Phase 14 Final: AI Memory Gateway v1 Completion Decision
// ======================================================
const phase14FinalCompletionService = require("../services/phase14-final-completion.service");

router.get("/system/phase14-final-checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14FinalCompletionService.getPhase14FinalChecklist());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-final.routes" });
  }
});

router.get("/system/phase14-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14FinalCompletionService.runPhase14FinalDecision(req.query || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-final.routes" });
  }
});

router.post("/system/phase14-final-decision", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14FinalCompletionService.runPhase14FinalDecision(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-final.routes" });
  }
});

router.post("/system/phase14-final-test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(phase14FinalCompletionService.runPhase14FinalTest(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase14-final.routes" });
  }
});


// ======================================================
// Phase 15-1: Imported Conversation Storage Tables
// ======================================================
const importedConversationService = require("../services/imported-conversation.service");

router.get("/imports/conversations/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await importedConversationService.getImportedConversationStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-imported-conversation.routes" });
  }
});

router.get("/imports/conversations/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const status = await importedConversationService.getImportedConversationStatus();
    return res.json({
      ok: true,
      phase: "15-1",
      checked_at: new Date().toISOString(),
      checklist_status: status.storage_status,
      checklist: status.checklist,
      tables: status.tables,
      counts: status.counts
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-imported-conversation.routes" });
  }
});

router.post("/imports/conversations/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await importedConversationService.runImportedConversationStorageTest(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-imported-conversation.routes" });
  }
});

// ======================================================
// Phase 15-3: Imported Conversation -> Summary Queue Link
// ======================================================
const phase15SummaryQueueLinkService = require("../services/phase15-summary-queue-link.service");

router.get("/imports/summary-queue-link/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15SummaryQueueLinkService.getSummaryQueueLinkStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-summary-queue-link.routes" });
  }
});

router.get("/imports/summary-queue-link/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const status = await phase15SummaryQueueLinkService.getSummaryQueueLinkStatus();
    return res.json({
      ok: status.ok,
      phase: "15-3",
      checked_at: new Date().toISOString(),
      checklist_status: status.link_status,
      checklist: status.checklist,
      tables: status.tables,
      counts: status.counts
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-summary-queue-link.routes" });
  }
});

router.post("/imports/summary-queue-link/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15SummaryQueueLinkService.runSummaryQueueLinkTest(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-summary-queue-link.routes" });
  }
});

router.post("/imports/summary-queue-link/queue", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15SummaryQueueLinkService.queueImportedConversationsForSummary(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-summary-queue-link.routes" });
  }
});

// ======================================================
// Phase 15-4: Import Memory Search
// ======================================================
const phase15ImportMemorySearchService = require("../services/phase15-import-memory-search.service");

router.get("/imports/memory-search/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15ImportMemorySearchService.getImportMemorySearchStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-import-memory-search.routes" });
  }
});

router.get("/imports/memory-search/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const status = await phase15ImportMemorySearchService.getImportMemorySearchStatus();
    return res.json({
      ok: status.ok,
      phase: "15-4",
      checked_at: new Date().toISOString(),
      checklist_status: status.search_status,
      checklist: status.checklist,
      tables: status.tables,
      counts: status.counts,
      default_filters: status.default_filters
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-import-memory-search.routes" });
  }
});

router.post("/imports/memory-search/search", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15ImportMemorySearchService.searchImportedMemories(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-import-memory-search.routes" });
  }
});

router.post("/imports/memory-search/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15ImportMemorySearchService.runImportMemorySearchTest(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-import-memory-search.routes" });
  }
});

// ======================================================
// Phase 15-5: Gemini / Claude Importer Expansion
// ======================================================
const geminiClaudeImporterService = require("../services/gemini-claude-importer.service");

router.get("/imports/gemini-claude/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await geminiClaudeImporterService.getGeminiClaudeImporterStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-gemini-claude-importer.routes" });
  }
});

router.get("/imports/gemini-claude/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const status = await geminiClaudeImporterService.getGeminiClaudeImporterStatus();
    return res.json({
      ok: status.ok,
      phase: "15-5",
      checked_at: new Date().toISOString(),
      checklist_status: status.importer_status,
      checklist: status.checklist,
      dependency: status.dependency,
      counts: status.counts,
      supported_platforms: status.supported_platforms
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-gemini-claude-importer.routes" });
  }
});

router.post("/imports/gemini-claude/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await geminiClaudeImporterService.runGeminiClaudeImporterTest(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-gemini-claude-importer.routes" });
  }
});

router.post("/imports/gemini-claude/import", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await geminiClaudeImporterService.importGeminiClaudeExport(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-gemini-claude-importer.routes" });
  }
});


// ======================================================
// Phase 15-6: Import Quality Review / Deduplication
// ======================================================
const phase15ImportQualityReviewService = require("../services/phase15-import-quality-review.service");

router.get("/imports/quality-review/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15ImportQualityReviewService.getImportQualityReviewStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-import-quality-review.routes" });
  }
});

router.get("/imports/quality-review/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    const status = await phase15ImportQualityReviewService.getImportQualityReviewStatus();
    return res.json({
      ok: status.ok,
      phase: "15-6",
      checked_at: new Date().toISOString(),
      checklist_status: status.review_status,
      checklist: status.checklist,
      counts: status.counts,
      default_filters: status.default_filters,
      next_actions: status.next_actions
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-import-quality-review.routes" });
  }
});

router.post("/imports/quality-review/review", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15ImportQualityReviewService.reviewImportedConversationQuality(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-import-quality-review.routes" });
  }
});

router.post("/imports/quality-review/duplicates", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15ImportQualityReviewService.scanDuplicateCandidates(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-import-quality-review.routes" });
  }
});

router.post("/imports/quality-review/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15ImportQualityReviewService.runImportQualityReviewTest(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-import-quality-review.routes" });
  }
});

// ======================================================
// Phase 15-7: Import Final Checklist
// ======================================================
const phase15FinalChecklistService = require("../services/phase15-final-checklist.service");

router.get("/imports/final/status", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15FinalChecklistService.getPhase15FinalStatus());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-final-checklist.routes" });
  }
});

router.get("/imports/final/checklist", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15FinalChecklistService.getPhase15FinalChecklist());
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-final-checklist.routes" });
  }
});

router.post("/imports/final/test", adminApiAuthMiddleware, async (req, res) => {
  try {
    return res.json(await phase15FinalChecklistService.runPhase15FinalTest(req.body || {}));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, source: "phase15-final-checklist.routes" });
  }
});
