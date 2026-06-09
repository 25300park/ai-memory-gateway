const { buildAiRequestPipelineDraft } = require("./ai-pipeline.service");
const { testProviderAdapter } = require("./model-provider.service");
const { selectProviderRoute } = require("./provider-router.service");
const { logConversationEnhanced } = require("./logger.service");

function normalizeBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === "true" || value === "1" || value === 1 || value === "yes" || value === "on") return true;
  if (value === false || value === "false" || value === "0" || value === 0 || value === "no" || value === "off") return false;
  return defaultValue;
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (["gpt", "openai"].includes(provider)) return "openai";
  if (["claude", "anthropic"].includes(provider)) return "anthropic";
  if (["gemini", "google"].includes(provider)) return "google";
  if (["mock", "test"].includes(provider)) return "mock";
  return provider || null;
}

function extractProviderAnswer(providerResult) {
  const response = providerResult?.response || providerResult;
  if (typeof response === "string") return response;
  return response?.answer
    || response?.storedAssistantMessage
    || providerResult?.answer
    || "[NO_ANSWER_RETURNED] Provider adapter completed, but no answer text was returned.";
}

function extractStoredAssistantMessage(providerResult) {
  const response = providerResult?.response || providerResult;
  if (typeof response === "string") return response;
  return response?.storedAssistantMessage
    || response?.answer
    || providerResult?.answer
    || "[NO_STORED_ASSISTANT_MESSAGE] Provider adapter completed.";
}

function buildResponseExecutionPlan({ pipelineDraft, save_to_memory, logResult, routeResult, providerResult, useProviderRouter }) {
  const basePlan = Array.isArray(pipelineDraft?.execution_plan)
    ? pipelineDraft.execution_plan.map((step) => ({ ...step }))
    : [];

  const routerStepStatus = useProviderRouter
    ? (routeResult?.ok ? "completed" : "failed")
    : "skipped";

  const providerStepStatus = providerResult?.ok ? "completed" : "failed";

  return [
    ...basePlan,
    {
      step: basePlan.length + 1,
      name: "Select provider with Provider Router",
      status: routerStepStatus,
      detail: useProviderRouter
        ? `Router selected ${routeResult?.selected_provider || "none"}/${routeResult?.selected_model || "none"}. route_status=${routeResult?.route_status || "unknown"}`
        : "Provider Router was disabled. The legacy pipeline selected_model was used."
    },
    {
      step: basePlan.length + 2,
      name: "Generate AI response through provider adapter",
      status: providerStepStatus,
      detail: `adapter_status=${providerResult?.adapter_status || providerResult?.provider_test?.adapter_status || "unknown"}, live_requested=${Boolean(providerResult?.live_requested)}`
    },
    {
      step: basePlan.length + 3,
      name: "Store conversation and memory buffer",
      status: save_to_memory ? "completed" : "skipped",
      detail: save_to_memory
        ? `Conversation log saved. conversationLogId=${logResult?.conversationLogId || logResult?.conversation_log_id || "unknown"}`
        : "save_to_memory=false, so conversation log, recent buffer, and summary queue insert were skipped."
    }
  ];
}

async function runMemoryContextResponseTest({
  project_code,
  session_id,
  user_id = "admin-test-user",
  question,
  save_to_memory = true,
  include_prompt = true,
  include_packet = false,
  use_assembly = true,
  recent_buffer_keep_limit = 10,
  create_summary_queue = true,
  use_provider_router = true,
  intent = "general",
  preferred_provider = null,
  force_provider = null,
  model_name = null,
  live = false,
  allow_fallback = true,
  require_live = null
}) {
  if (!project_code || !session_id || !question) {
    throw new Error("project_code, session_id, and question are required.");
  }

  const normalizedSaveToMemory = normalizeBoolean(save_to_memory, true);
  const normalizedUseProviderRouter = normalizeBoolean(use_provider_router, true);
  const normalizedLive = normalizeBoolean(live, false);
  const normalizedAllowFallback = normalizeBoolean(allow_fallback, true);

  const pipelineDraft = await buildAiRequestPipelineDraft({
    project_code,
    session_id,
    question,
    dry_run: true,
    include_prompt: normalizeBoolean(include_prompt, true),
    include_packet: normalizeBoolean(include_packet, false),
    use_assembly: normalizeBoolean(use_assembly, true)
  });

  const finalPrompt = pipelineDraft.final_prompt || question;

  let routeResult = null;
  let selectedModel = pipelineDraft.selected_model || {};

  if (normalizedUseProviderRouter) {
    routeResult = await selectProviderRoute({
      intent,
      preferred_provider,
      force_provider,
      model_name,
      prompt: finalPrompt,
      live: normalizedLive,
      require_live,
      allow_fallback: normalizedAllowFallback
    });

    if (!routeResult.ok) {
      return {
        ok: false,
        mode: "memory_context_response_test_with_provider_router",
        phase: "11-6",
        tested_at: new Date().toISOString(),
        project_code,
        session_id,
        user_id,
        question,
        response_status: "ROUTER_SELECTION_FAILED",
        route_result: routeResult,
        selected_model: selectedModel,
        readiness: pipelineDraft.readiness,
        context_summary: pipelineDraft.context_summary,
        context_assembly_summary: pipelineDraft.context_assembly_summary,
        final_prompt: normalizeBoolean(include_prompt, true) ? finalPrompt : null,
        pipeline_draft: normalizeBoolean(include_packet, false) ? pipelineDraft : null,
        recommended_action: "Check Provider Router status, live safety gates, allowed providers, API keys, and fallback settings."
      };
    }

    selectedModel = {
      ...(selectedModel || {}),
      provider: routeResult.selected_provider,
      model_name: routeResult.selected_model,
      model_code: `${routeResult.selected_provider}_${String(routeResult.selected_model || "model").replace(/[^a-zA-Z0-9_\-]/g, "_")}`,
      display_name: `${routeResult.selected_provider} / ${routeResult.selected_model}`,
      routed_by: "provider_router",
      route_status: routeResult.route_status
    };
  }

  if (!selectedModel.provider) {
    selectedModel.provider = normalizeProvider(selectedModel.provider) || "mock";
  }

  let providerResult = await testProviderAdapter({
    provider: selectedModel.provider,
    model_name: selectedModel.model_name || model_name,
    prompt: finalPrompt,
    live: normalizedLive
  });

  const runtimeFallbackTrace = [];
  let runtimeFallbackApplied = false;

  if (!providerResult?.ok && normalizedUseProviderRouter && normalizedAllowFallback && !force_provider) {
    runtimeFallbackTrace.push({
      provider: selectedModel.provider,
      model_name: selectedModel.model_name || model_name,
      decision: "CALL_FAILED",
      adapter_status: providerResult?.adapter_status || "UNKNOWN",
      error: providerResult?.error || providerResult?.message || null
    });

    const fallbackCandidates = Array.isArray(routeResult?.fallback_chain) ? routeResult.fallback_chain : [];

    for (const candidate of fallbackCandidates) {
      const candidateProvider = normalizeProvider(candidate.provider);
      if (!candidateProvider || candidateProvider === selectedModel.provider) continue;

      if (normalizedLive && candidateProvider !== "mock" && candidate.live_ready === false) {
        runtimeFallbackTrace.push({
          provider: candidateProvider,
          model_name: candidate.model_name,
          decision: "SKIPPED_NOT_LIVE_READY",
          reason: "Live request was enabled, but this fallback provider is not live-ready."
        });
        continue;
      }

      const fallbackResult = await testProviderAdapter({
        provider: candidateProvider,
        model_name: candidate.model_name,
        prompt: finalPrompt,
        live: normalizedLive && candidateProvider !== "mock"
      });

      runtimeFallbackTrace.push({
        provider: candidateProvider,
        model_name: candidate.model_name,
        decision: fallbackResult?.ok ? "FALLBACK_CALL_COMPLETED" : "FALLBACK_CALL_FAILED",
        adapter_status: fallbackResult?.adapter_status || "UNKNOWN",
        error: fallbackResult?.error || fallbackResult?.message || null
      });

      if (fallbackResult?.ok) {
        providerResult = fallbackResult;
        runtimeFallbackApplied = true;
        selectedModel = {
          ...(selectedModel || {}),
          provider: candidateProvider,
          model_name: candidate.model_name,
          model_code: `${candidateProvider}_${String(candidate.model_name || "model").replace(/[^a-zA-Z0-9_\-]/g, "_")}`,
          display_name: `${candidateProvider} / ${candidate.model_name}`,
          routed_by: "provider_router_runtime_fallback",
          route_status: "RUNTIME_FALLBACK_SELECTED",
          original_selected_provider: routeResult?.selected_provider || null,
          original_selected_model: routeResult?.selected_model || null
        };
        break;
      }
    }
  }

  const answer = extractProviderAnswer(providerResult);
  const storedAssistantMessage = extractStoredAssistantMessage(providerResult);

  let logResult = null;

  if (normalizedSaveToMemory && providerResult?.ok) {
    logResult = await logConversationEnhanced({
      project_code,
      session_id,
      user_id,
      source_ai: selectedModel.provider || "unknown",
      model_name: selectedModel.model_name || selectedModel.model_code || "unknown",
      user_message: question,
      assistant_message: storedAssistantMessage,
      raw_text: `User: ${question}\n\nAssistant: ${storedAssistantMessage}`,
      recent_buffer_keep_limit,
      create_summary_queue
    });
  }

  const executionPlan = buildResponseExecutionPlan({
    pipelineDraft,
    save_to_memory: normalizedSaveToMemory && providerResult?.ok,
    logResult,
    routeResult,
    providerResult,
    useProviderRouter: normalizedUseProviderRouter
  });

  return {
    ok: Boolean(providerResult?.ok),
    mode: "memory_context_response_test_with_provider_router",
    phase: "11-6",
    tested_at: new Date().toISOString(),
    project_code,
    session_id,
    user_id,
    question,
    response_status: providerResult?.ok
      ? (runtimeFallbackApplied ? "COMPLETED_WITH_RUNTIME_FALLBACK_PROVIDER" : "COMPLETED_WITH_ROUTED_PROVIDER")
      : "PROVIDER_CALL_FAILED",
    selected_model: selectedModel,
    provider_router: {
      enabled: normalizedUseProviderRouter,
      intent,
      preferred_provider: preferred_provider || null,
      force_provider: force_provider || null,
      live_requested: normalizedLive,
      allow_fallback: normalizedAllowFallback,
      route_status: runtimeFallbackApplied ? "RUNTIME_FALLBACK_SELECTED" : (routeResult?.route_status || "NOT_USED"),
      selected_provider: routeResult?.selected_provider || selectedModel.provider,
      selected_model: routeResult?.selected_model || selectedModel.model_name,
      final_provider: selectedModel.provider,
      final_model: selectedModel.model_name,
      fallback_chain: routeResult?.fallback_chain || [],
      routing_trace: routeResult?.routing_trace || [],
      runtime_fallback_applied: runtimeFallbackApplied,
      runtime_fallback_trace: runtimeFallbackTrace
    },
    provider_result: providerResult,
    readiness: pipelineDraft.readiness,
    context_summary: pipelineDraft.context_summary,
    context_assembly_summary: pipelineDraft.context_assembly_summary,
    answer,
    stored: {
      save_to_memory: normalizedSaveToMemory && providerResult?.ok,
      conversation_log_id: logResult?.conversationLogId || logResult?.conversation_log_id || null,
      recent_buffer_updated: Boolean(logResult),
      recent_buffer_cleanup: logResult?.recent_buffer_cleanup || null,
      summary_queue_created: Boolean(logResult?.summary_queue_id),
      summary_queue_id: logResult?.summary_queue_id || null,
      storage_steps: logResult?.storage_steps || []
    },
    execution_plan: executionPlan,
    final_prompt: normalizeBoolean(include_prompt, true) ? finalPrompt : null,
    pipeline_draft: normalizeBoolean(include_packet, false) ? pipelineDraft : null,
    storage_details: logResult || null,
    next_step: "Phase 11-7 validates multi-provider response routing, fallback behavior, and final Phase 11 completion readiness."
  };
}

module.exports = {
  runMemoryContextResponseTest
};
