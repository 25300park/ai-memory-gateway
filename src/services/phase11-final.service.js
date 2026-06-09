const {
  getProviderRouterStatus,
  runProviderFallbackMatrix,
  getPhase11FinalPreparation
} = require("./provider-router.service");
const {
  getOpenAiLiveStatus,
  getAnthropicLiveStatus,
  getGeminiLiveStatus
} = require("./model-provider.service");
const { runMemoryContextResponseTest } = require("./ai-response-test.service");

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === "true" || value === "1" || value === 1 || value === "yes" || value === "on") return true;
  if (value === false || value === "false" || value === "0" || value === 0 || value === "no" || value === "off") return false;
  return defaultValue;
}

function providerReadyFromStatus(statusResult, providerKey) {
  const liveConfig = statusResult?.live_config || {};
  const providerEnabledKey = providerKey === "openai"
    ? "openai_live_enabled"
    : providerKey === "anthropic"
      ? "anthropic_live_enabled"
      : "gemini_live_enabled";

  return {
    provider: providerKey,
    ok: Boolean(statusResult?.ok),
    status: statusResult?.status || "UNKNOWN",
    live_ready: Boolean(liveConfig.live_call_allowed),
    api_key_configured: Boolean(liveConfig.api_key_configured),
    live_mode_enabled: Boolean(liveConfig.live_mode_enabled),
    provider_live_enabled: Boolean(liveConfig[providerEnabledKey]),
    default_model: liveConfig.default_model || null,
    allowed_models: liveConfig.allowed_models || [],
    raw: statusResult
  };
}

function calculateDecision({ routerStatus, fallbackMatrix, finalPrep, providerStatuses, smokeTest }) {
  const errors = [];
  const warnings = [];
  const completedItems = [];

  const routerOk = Boolean(routerStatus?.ok) && routerStatus.router_status !== "ERROR";
  if (routerOk) completedItems.push("Provider Router status loaded and usable");
  else errors.push("Provider Router status is not ready.");

  const matrixOk = Boolean(fallbackMatrix?.ok) && Number(fallbackMatrix.failed_count || 0) === 0;
  if (matrixOk) completedItems.push("Provider fallback matrix passed");
  else errors.push("Provider fallback matrix has failures or could not run.");

  const finalPrepOk = Boolean(finalPrep?.phase11_final_ready);
  if (finalPrepOk) completedItems.push("Phase 11 final preparation is ready");
  else warnings.push("Phase 11 final preparation is not fully ready. Check final_prep_status.");

  const liveReadyProviders = providerStatuses.filter((item) => item.live_ready);
  if (liveReadyProviders.length >= 1) completedItems.push(`At least one live provider is ready: ${liveReadyProviders.map((p) => p.provider).join(", ")}`);
  else warnings.push("No live provider is currently ready. Mock and dry-run routing may still pass.");

  const providerCountOk = providerStatuses.length >= 3;
  if (providerCountOk) completedItems.push("OpenAI, Anthropic, and Gemini provider status checks are available");
  else errors.push("One or more provider status checks are missing.");

  if (smokeTest) {
    if (smokeTest.ok) completedItems.push("Optional routed response smoke test passed");
    else warnings.push("Optional routed response smoke test did not pass. Review smoke_test_result.");
  }

  const criticalErrorCount = errors.length;
  const warningCount = warnings.length;

  let decisionStatus = "NOT_READY";
  if (criticalErrorCount === 0 && warningCount === 0) {
    decisionStatus = "READY_FOR_PHASE_12";
  } else if (criticalErrorCount === 0) {
    decisionStatus = "READY_WITH_WARNINGS";
  }

  return {
    decision_status: decisionStatus,
    phase12_entry_allowed: decisionStatus === "READY_FOR_PHASE_12" || decisionStatus === "READY_WITH_WARNINGS",
    errors,
    warnings,
    completed_items: completedItems,
    score: Math.max(0, Math.min(100, 100 - criticalErrorCount * 30 - warningCount * 10))
  };
}

async function runPhase11FinalDecision({
  project_code = "rbs_ai_memory",
  session_id = "phase-11-final-smoke-test",
  user_id = "admin-final-check",
  question = "Phase 11 Final routed multi-provider response smoke test.",
  run_response_smoke_test = false,
  save_smoke_test_to_memory = false,
  process_summary_batch = false,
  execute_fallback_matrix = false,
  live = false,
  preferred_provider = "mock",
  intent = "reasoning"
} = {}) {
  const testedAt = new Date().toISOString();

  const routerStatus = await getProviderRouterStatus();
  const fallbackMatrix = await runProviderFallbackMatrix({ execute_test: false, live: false });
  const finalPrep = await getPhase11FinalPreparation({
    run_fallback_matrix: true,
    execute_test: Boolean(execute_fallback_matrix)
  });

  const providerStatuses = [
    providerReadyFromStatus(await getOpenAiLiveStatus(), "openai"),
    providerReadyFromStatus(await getAnthropicLiveStatus(), "anthropic"),
    providerReadyFromStatus(await getGeminiLiveStatus(), "google")
  ];

  let smokeTest = null;
  if (normalizeBoolean(run_response_smoke_test, false)) {
    smokeTest = await runMemoryContextResponseTest({
      project_code,
      session_id,
      user_id,
      question,
      save_to_memory: normalizeBoolean(save_smoke_test_to_memory, false),
      use_provider_router: true,
      intent,
      preferred_provider,
      live: normalizeBoolean(live, false),
      allow_fallback: true,
      use_assembly: true,
      create_summary_queue: normalizeBoolean(save_smoke_test_to_memory, false),
      include_prompt: false,
      include_packet: false
    });
  }

  const decision = calculateDecision({
    routerStatus,
    fallbackMatrix,
    finalPrep,
    providerStatuses,
    smokeTest
  });

  return {
    ok: decision.phase12_entry_allowed,
    phase: "11-final",
    project_code,
    tested_at: testedAt,
    decision_status: decision.decision_status,
    phase12_entry_allowed: decision.phase12_entry_allowed,
    score: decision.score,
    summary: {
      router_status: routerStatus?.router_status || "UNKNOWN",
      fallback_matrix_status: fallbackMatrix?.matrix_status || "UNKNOWN",
      fallback_failed_count: fallbackMatrix?.failed_count ?? null,
      final_prep_status: finalPrep?.final_prep_status || "UNKNOWN",
      live_ready_provider_count: providerStatuses.filter((item) => item.live_ready).length,
      smoke_test_status: smokeTest ? (smokeTest.response_status || (smokeTest.ok ? "PASSED" : "FAILED")) : "SKIPPED"
    },
    provider_statuses: providerStatuses.map(({ raw, ...safe }) => safe),
    router_status: routerStatus,
    fallback_matrix: fallbackMatrix,
    final_preparation: finalPrep,
    smoke_test_result: smokeTest,
    completed_items: decision.completed_items,
    warnings: decision.warnings,
    errors: decision.errors,
    recommended_next_step: decision.phase12_entry_allowed
      ? "Proceed to Phase 12: 운영 보안 및 배포 안정화. Keep Developer/Diagnostic menus hidden or grouped later during production cleanup."
      : "Fix the listed errors, rerun Provider Fallback Matrix, then rerun Phase 11 Final Decision."
  };
}

function getPhase11CompletionChecklist() {
  return {
    ok: true,
    phase: "11-final",
    checklist: [
      { key: "openai_provider", label: "OpenAI live provider connected and safety gate tested" },
      { key: "anthropic_provider", label: "Anthropic / Claude provider connected and safety gate tested" },
      { key: "gemini_provider", label: "Gemini / Google provider connected and safety gate tested" },
      { key: "provider_router", label: "Provider Router rules and selection API completed" },
      { key: "response_router", label: "AI Response Test uses Provider Router" },
      { key: "runtime_fallback", label: "Runtime fallback after selected provider call failure is prepared" },
      { key: "fallback_matrix", label: "Multi-provider fallback matrix is available" },
      { key: "phase11_final", label: "Phase 11 Final Decision API and screen are ready" }
    ],
    next_phase: "Phase 12: 운영 보안 및 배포 안정화"
  };
}

module.exports = {
  runPhase11FinalDecision,
  getPhase11CompletionChecklist
};
