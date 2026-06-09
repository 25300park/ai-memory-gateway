const { buildContextPreview, buildProductionContextAssembly } = require("./context.service");
const { selectModel } = require("./router.service");

function countText(value) {
  return value ? String(value).length : 0;
}

function normalizeBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return defaultValue;
}

function normalizeModelProfile(modelProfile) {
  if (!modelProfile) {
    return {
      provider: "unknown",
      model_code: "unknown",
      model_name: "unknown",
      routing_rule_id: null,
      routing_rule_name: null
    };
  }

  return {
    provider: modelProfile.provider || "unknown",
    model_code: modelProfile.model_code || modelProfile.target_model_code || "unknown",
    model_name: modelProfile.model_name || "unknown",
    routing_rule_id: modelProfile.id || null,
    routing_rule_name: modelProfile.rule_name || modelProfile.name || null,
    priority: modelProfile.priority ?? null
  };
}

function buildPipelineWarnings({ contextPreview, modelProfile, finalPrompt }) {
  const warnings = [];
  const readinessStatus = contextPreview?.summary?.readiness_status;
  const promptLength = countText(finalPrompt);

  if (!modelProfile) {
    warnings.push("Model routing did not return a model profile.");
  }

  if (readinessStatus === "NOT_READY") {
    warnings.push("Context preview is NOT_READY. Add more Project Assets, Recent Buffer, or Summarized Memory before live AI execution.");
  }

  if (readinessStatus === "READY_WITH_WARNINGS") {
    warnings.push("Context preview is READY_WITH_WARNINGS. Review context warnings before live execution.");
  }

  if (!finalPrompt) {
    warnings.push("Final prompt is empty.");
  }

  if (promptLength > 20000) {
    warnings.push(`Final prompt is long (${promptLength} characters). Token trimming may be needed before production use.`);
  }

  return warnings;
}

function buildRequestMessages({ systemContextText, finalPrompt, question }) {
  return [
    {
      role: "system",
      content: systemContextText || "You are connected to AI Memory Gateway. Use the provided context carefully."
    },
    {
      role: "user",
      content: finalPrompt || question
    }
  ];
}

function buildExecutionPlan({ project_code, session_id, question, contextPreview, modelProfile, finalPrompt, dry_run }) {
  return [
    {
      step: 1,
      name: "Validate request",
      status: "completed",
      detail: "project_code, session_id, and question were validated."
    },
    {
      step: 2,
      name: "Build memory context",
      status: "completed",
      detail: `Project Assets: ${contextPreview.summary.project_assets_count}, Recent Buffer: ${contextPreview.summary.recent_buffer_count}, Summarized Memory: ${contextPreview.summary.summarized_memory_count}`
    },
    {
      step: 3,
      name: "Preview prompt readiness",
      status: "completed",
      detail: `Readiness: ${contextPreview.summary.readiness_status}, Score: ${contextPreview.summary.readiness_score}`
    },
    {
      step: 4,
      name: "Select model profile",
      status: "completed",
      detail: `${modelProfile.provider} / ${modelProfile.model_code} / ${modelProfile.model_name}`
    },
    {
      step: 5,
      name: "Build AI request payload",
      status: "completed",
      detail: `Prompt length: ${countText(finalPrompt)} characters`
    },
    {
      step: 6,
      name: "Call external AI model",
      status: dry_run ? "skipped" : "planned",
      detail: dry_run
        ? "Phase 10-3 is draft mode only. No external AI request was sent."
        : "Live execution will be connected in a later Phase 10 step."
    },
    {
      step: 7,
      name: "Store response and memory logs",
      status: "planned",
      detail: "Conversation log, Recent Buffer update, and Summary Queue connection will be implemented in later Phase 10 steps."
    }
  ];
}

async function buildAiRequestPipelineDraft({
  project_code,
  session_id,
  question,
  include_prompt = true,
  include_packet = true,
  dry_run = true,
  use_assembly = true
}) {
  if (!project_code || !session_id || !question) {
    throw new Error("project_code, session_id, and question are required.");
  }

  const normalizedDryRun = normalizeBoolean(dry_run, true);

  const contextPreview = await buildContextPreview({
    project_code,
    session_id,
    question,
    include_prompt: normalizeBoolean(include_prompt, true),
    include_packet: normalizeBoolean(include_packet, true)
  });

  const assembly = use_assembly === false ? null : await buildProductionContextAssembly({
    project_code,
    session_id,
    question
  });

  const modelProfile = normalizeModelProfile(await selectModel({ question }));
  const finalPrompt = assembly?.assembled_prompt || contextPreview.final_prompt || question;
  const systemContextText = contextPreview.context_packet?.system_context_text || null;
  const messages = buildRequestMessages({
    systemContextText,
    finalPrompt,
    question
  });

  const warnings = buildPipelineWarnings({
    contextPreview,
    modelProfile,
    finalPrompt
  });

  const executionPlan = buildExecutionPlan({
    project_code,
    session_id,
    question,
    contextPreview,
    modelProfile,
    finalPrompt,
    dry_run: normalizedDryRun
  });

  const readinessStatus = warnings.some((warning) => warning.includes("NOT_READY"))
    ? "NOT_READY"
    : warnings.length > 0
      ? "READY_WITH_WARNINGS"
      : "READY_FOR_DRAFT_TEST";

  return {
    ok: true,
    mode: "ai_request_pipeline_draft",
    phase: "10-3",
    drafted_at: new Date().toISOString(),
    project_code,
    session_id,
    question,
    dry_run: normalizedDryRun,
    readiness: {
      status: readinessStatus,
      can_send_live_request: false,
      reason: "Phase 10-3 prepares the request pipeline draft only. Live external AI execution is intentionally disabled in this phase.",
      warnings
    },
    selected_model: modelProfile,
    context_summary: contextPreview.summary,
    context_assembly_summary: assembly ? assembly.quality : null,
    context_assembly_trace: assembly ? assembly.assembly_trace : null,
    request_payload_preview: {
      provider: modelProfile.provider,
      model: modelProfile.model_name,
      model_code: modelProfile.model_code,
      messages,
      metadata: {
        project_code,
        session_id,
        pipeline_phase: "10-3",
        prompt_length: countText(finalPrompt),
        context_readiness_status: contextPreview.summary.readiness_status,
        context_readiness_score: contextPreview.summary.readiness_score,
        assembly_status: assembly?.quality?.status || null,
        assembly_score: assembly?.quality?.score || null
      }
    },
    execution_plan: executionPlan,
    final_prompt: normalizeBoolean(include_prompt, true) ? finalPrompt : null,
    context_preview: normalizeBoolean(include_packet, true) ? contextPreview : null,
    context_assembly: normalizeBoolean(include_packet, true) ? assembly : null,
    next_step: "Phase 10-4 assembly is now available. The next step will connect safe live AI response execution and post-response memory logging."
  };
}

module.exports = {
  buildAiRequestPipelineDraft
};
