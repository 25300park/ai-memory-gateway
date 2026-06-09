const pool = require("../config/db");
const { buildProductionContextAssembly } = require("./context.service");
const { buildAiRequestPipelineDraft } = require("./ai-pipeline.service");
const { runMemoryContextResponseTest } = require("./ai-response-test.service");
const { getResponseStorageStatus } = require("./logger.service");
const { getSummaryWorkerStatus, getSummaryIntegrationStatus } = require("./summary-worker.service");

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return defaultValue;
}

function toInt(value, defaultValue = 10, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.min(Math.floor(n), max);
}

async function getTableCount(tableName, whereSql = "", params = []) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM ${tableName} ${whereSql}`, params);
  return Number(rows[0]?.count || 0);
}

async function getProjectDataCounts(project_code, session_id) {
  const [rows] = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM project_assets WHERE project_code = ? AND is_active = TRUE) AS project_assets_count,
      (SELECT COUNT(*) FROM ai_recent_buffer WHERE project_code = ? AND session_id = ?) AS recent_buffer_count,
      (SELECT COUNT(*) FROM ai_memory WHERE project_code = ? AND status = 'active') AS active_memory_count,
      (SELECT COUNT(*) FROM ai_memory WHERE project_code = ? AND status = 'active' AND memory_type = 'conversation_summary') AS conversation_summary_count,
      (SELECT COUNT(*) FROM ai_conversation_logs WHERE project_code = ? AND session_id = ?) AS conversation_logs_count,
      (SELECT COUNT(*) FROM ai_summary_queue WHERE project_code = ? AND status = 'pending') AS pending_summary_queue_count,
      (SELECT COUNT(*) FROM ai_summary_queue WHERE project_code = ? AND status = 'failed') AS failed_summary_queue_count,
      (SELECT COUNT(*) FROM ai_summary_queue WHERE project_code = ? AND status = 'completed') AS completed_summary_queue_count
    `,
    [
      project_code,
      project_code,
      session_id,
      project_code,
      project_code,
      project_code,
      session_id,
      project_code,
      project_code,
      project_code
    ]
  );

  const row = rows[0] || {};
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value || 0)])
  );
}

function buildChecklist({ checks }) {
  return [
    {
      key: "context_assembly",
      group: "context",
      label: "Context Assembly builds Project Assets + Recent Buffer + Summarized Memory prompt",
      status: checks.contextAssemblyStatus,
      required: true
    },
    {
      key: "pipeline_draft",
      group: "pipeline",
      label: "AI Request Pipeline Draft builds selected model, execution plan, and request payload",
      status: checks.pipelineDraftStatus,
      required: true
    },
    {
      key: "response_test",
      group: "response",
      label: "AI Response Test returns an answer with memory context",
      status: checks.responseTestStatus,
      required: true
    },
    {
      key: "response_storage",
      group: "storage",
      label: "Conversation Log, Recent Buffer, and Summary Queue storage are connected",
      status: checks.responseStorageStatus,
      required: true
    },
    {
      key: "summary_worker",
      group: "worker",
      label: "Summary Worker can process pending queue into long-term memory",
      status: checks.summaryWorkerStatus,
      required: true
    },
    {
      key: "summarized_memory_reuse",
      group: "memory",
      label: "Summarized Memory exists and can be reused by later Context Assembly",
      status: checks.summarizedMemoryReuseStatus,
      required: false
    },
    {
      key: "failed_queue_clean",
      group: "stability",
      label: "No failed Summary Queue items remain for the project",
      status: checks.failedQueueStatus,
      required: true
    }
  ];
}

function decidePhase10({ checklist, warnings, errors }) {
  const requiredItems = checklist.filter((item) => item.required);
  const requiredDone = requiredItems.filter((item) => item.status === "PASS").length;
  const requiredTotal = requiredItems.length;
  const allRequiredPassed = requiredDone === requiredTotal;
  const optionalWarnings = checklist.filter((item) => !item.required && item.status !== "PASS").length;

  let decision_status = "NOT_READY";
  let phase11_entry_allowed = false;
  let decision_message = "Phase 10 is not ready. Resolve required failed checks before Phase 11.";

  if (errors.length > 0 || !allRequiredPassed) {
    decision_status = "NOT_READY";
    phase11_entry_allowed = false;
  } else if (warnings.length > 0 || optionalWarnings > 0) {
    decision_status = "READY_WITH_WARNINGS";
    phase11_entry_allowed = true;
    decision_message = "Phase 10 core pipeline is complete. You can enter Phase 11, but review warnings first.";
  } else {
    decision_status = "READY_FOR_PHASE_11";
    phase11_entry_allowed = true;
    decision_message = "Phase 10 is complete. You can start Phase 11: GPT / Claude / Gemini multi-model integration.";
  }

  return {
    decision_status,
    phase11_entry_allowed,
    decision_message,
    required_done: requiredDone,
    required_total: requiredTotal,
    completion_percent: requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 0
  };
}

async function runPhase10FinalDecision({
  project_code = "rbs_ai_memory",
  session_id = "phase-10-final-decision-test",
  question = "Phase 10 Final에서 실제 AI 응답 파이프라인 완료 여부를 점검합니다.",
  run_response_smoke_test = false,
  save_smoke_test_to_memory = false,
  process_summary_batch = false,
  summary_batch_limit = 3
} = {}) {
  if (!project_code || !session_id || !question) {
    throw new Error("project_code, session_id, and question are required.");
  }

  const checkedAt = new Date().toISOString();
  const warnings = [];
  const errors = [];
  const smokeResults = {};

  const countsBefore = await getProjectDataCounts(project_code, session_id);

  let contextAssembly = null;
  let pipelineDraft = null;
  let responseTest = null;
  let storageStatus = null;
  let summaryWorkerStatus = null;
  let summaryIntegrationStatus = null;
  let processedBatch = null;

  let contextAssemblyStatus = "FAIL";
  let pipelineDraftStatus = "FAIL";
  let responseTestStatus = "SKIPPED";
  let responseStorageStatus = "FAIL";
  let summaryWorkerStatusValue = "FAIL";
  let summarizedMemoryReuseStatus = "WARNING";
  let failedQueueStatus = "FAIL";

  try {
    contextAssembly = await buildProductionContextAssembly({
      project_code,
      session_id,
      question,
      project_asset_limit: 12,
      recent_buffer_limit: 8,
      summarized_memory_limit: 10,
      max_prompt_chars: 12000
    });
    contextAssemblyStatus = contextAssembly?.quality?.status === "NOT_READY" ? "FAIL" : "PASS";
    if (Array.isArray(contextAssembly?.warnings)) warnings.push(...contextAssembly.warnings.map((item) => `Context Assembly: ${item}`));
  } catch (error) {
    errors.push(`Context Assembly failed: ${error.message}`);
  }

  try {
    pipelineDraft = await buildAiRequestPipelineDraft({
      project_code,
      session_id,
      question,
      dry_run: true,
      include_prompt: true,
      include_packet: false,
      use_assembly: true
    });
    pipelineDraftStatus = pipelineDraft?.request_payload_preview ? "PASS" : "FAIL";
    if (Array.isArray(pipelineDraft?.readiness?.warnings)) warnings.push(...pipelineDraft.readiness.warnings.map((item) => `Pipeline Draft: ${item}`));
  } catch (error) {
    errors.push(`Pipeline Draft failed: ${error.message}`);
  }

  if (normalizeBoolean(run_response_smoke_test, false)) {
    try {
      responseTest = await runMemoryContextResponseTest({
        project_code,
        session_id,
        user_id: "phase-10-final-admin",
        question,
        save_to_memory: normalizeBoolean(save_smoke_test_to_memory, false),
        include_prompt: true,
        include_packet: false,
        use_assembly: true,
        recent_buffer_keep_limit: 10,
        create_summary_queue: true
      });
      responseTestStatus = responseTest?.answer ? "PASS" : "FAIL";
      smokeResults.response_test = {
        answer_preview: responseTest?.answer ? String(responseTest.answer).slice(0, 500) : null,
        stored: responseTest?.stored || null
      };
    } catch (error) {
      responseTestStatus = "FAIL";
      errors.push(`Response smoke test failed: ${error.message}`);
    }
  } else {
    responseTestStatus = pipelineDraftStatus === "PASS" ? "PASS" : "SKIPPED";
    warnings.push("Response smoke test was not executed. Use run_response_smoke_test=true for a live pipeline smoke test in safe model.factory mode.");
  }

  try {
    storageStatus = await getResponseStorageStatus({
      project_code,
      session_id,
      limit: 10
    });
    const hasConversation = Number(storageStatus?.counts?.conversation_logs || 0) > 0;
    const hasBuffer = Number(storageStatus?.counts?.recent_buffer || 0) > 0;
    const hasQueue = Number(storageStatus?.counts?.summary_queue || 0) > 0;
    responseStorageStatus = hasConversation && hasBuffer && hasQueue ? "PASS" : "WARNING";
    if (responseStorageStatus !== "PASS") {
      warnings.push("Response storage for this session is incomplete. Run AI Response Test with save_to_memory=true if this is a new session.");
    }
  } catch (error) {
    responseStorageStatus = "FAIL";
    errors.push(`Response Storage status failed: ${error.message}`);
  }

  try {
    if (normalizeBoolean(process_summary_batch, false)) {
      const { processSummaryQueueBatch } = require("./summary-worker.service");
      processedBatch = await processSummaryQueueBatch({
        project_code,
        limit: toInt(summary_batch_limit, 3, 20),
        source: "phase10_final_decision"
      });
      smokeResults.summary_batch = processedBatch;
    }

    summaryWorkerStatus = await getSummaryWorkerStatus({ project_code, recent_limit: 10 });
    summaryIntegrationStatus = await getSummaryIntegrationStatus({ project_code, session_id, limit: 10 });
    summaryWorkerStatusValue = summaryWorkerStatus?.worker_status === "ERROR" ? "FAIL" : "PASS";
    if (summaryWorkerStatus?.worker_status === "WARNING") warnings.push("Summary Worker status is WARNING. Review pending or processing queue items.");
    if (summaryWorkerStatus?.worker_status === "ERROR") errors.push("Summary Worker status is ERROR. Failed queue exists or worker status check failed.");
  } catch (error) {
    summaryWorkerStatusValue = "FAIL";
    errors.push(`Summary Worker status failed: ${error.message}`);
  }

  const countsAfter = await getProjectDataCounts(project_code, session_id);
  summarizedMemoryReuseStatus = countsAfter.conversation_summary_count > 0 ? "PASS" : "WARNING";
  if (summarizedMemoryReuseStatus !== "PASS") {
    warnings.push("No conversation_summary memory exists yet for this project. Run Summary Worker after AI Response Test creates pending queue.");
  }

  failedQueueStatus = countsAfter.failed_summary_queue_count === 0 ? "PASS" : "FAIL";
  if (failedQueueStatus !== "PASS") {
    errors.push(`Failed summary queue exists: ${countsAfter.failed_summary_queue_count}`);
  }

  const checklist = buildChecklist({
    checks: {
      contextAssemblyStatus,
      pipelineDraftStatus,
      responseTestStatus,
      responseStorageStatus: responseStorageStatus === "PASS" ? "PASS" : "FAIL",
      summaryWorkerStatus: summaryWorkerStatusValue,
      summarizedMemoryReuseStatus,
      failedQueueStatus
    }
  });

  const decision = decidePhase10({ checklist, warnings, errors });

  return {
    ok: true,
    phase_code: "phase_10",
    checked_at: checkedAt,
    project_code,
    session_id,
    question,
    decision_status: decision.decision_status,
    phase11_entry_allowed: decision.phase11_entry_allowed,
    decision_message: decision.decision_message,
    final_checklist: checklist,
    completion: {
      required_done: decision.required_done,
      required_total: decision.required_total,
      completion_percent: decision.completion_percent
    },
    counts: {
      before: countsBefore,
      after: countsAfter
    },
    readiness_summary: {
      context_assembly_status: contextAssembly?.quality?.status || null,
      context_assembly_score: contextAssembly?.quality?.score ?? null,
      pipeline_status: pipelineDraft?.readiness?.status || null,
      selected_model: pipelineDraft?.selected_model || null,
      response_test_status: responseTestStatus,
      response_storage_status: responseStorageStatus,
      summary_worker_status: summaryWorkerStatus?.worker_status || null,
      summary_integration_status: summaryIntegrationStatus?.integration_status || null
    },
    warnings,
    errors,
    smoke_results: smokeResults,
    artifacts: {
      context_assembly_trace: contextAssembly?.assembly_trace || null,
      execution_plan: pipelineDraft?.execution_plan || null,
      request_payload_preview: pipelineDraft?.request_payload_preview || null,
      storage_status: storageStatus || null,
      summary_worker_status: summaryWorkerStatus || null,
      summary_integration_status: summaryIntegrationStatus || null
    },
    next_step: decision.phase11_entry_allowed
      ? "Phase 11: GPT / Claude / Gemini multi-model integration"
      : "Resolve failed Phase 10 checks, then run Phase 10 Final Decision again."
  };
}

module.exports = {
  runPhase10FinalDecision
};
