const { runPhase10FinalDecision } = require("./phase10-final.service");

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return defaultValue;
}

function buildPhase10CompletionPlan(decision) {
  const allowed = Boolean(decision?.phase11_entry_allowed);
  const decisionStatus = decision?.decision_status || "UNKNOWN";
  const requiredCompletion = Number(decision?.completion?.completion_percent || 0);

  const completion_status = allowed ? "PHASE_10_COMPLETED" : "PHASE_10_NEEDS_FIX";
  const production_treatment = allowed
    ? "Mark Phase 10 as completed. Keep diagnostic menus available during Phase 11, but do not expose them to normal operators in production."
    : "Do not mark Phase 10 as completed yet. Resolve failed checklist items and run Phase 10 Final Decision again.";

  return {
    completion_status,
    decision_status: decisionStatus,
    phase11_entry_allowed: allowed,
    required_completion_percent: requiredCompletion,
    production_treatment,
    menu_recommendation: {
      current_stage: "development",
      keep_visible_now: true,
      production_recommendation: "Do not delete developer/diagnostic menus. Move them into a collapsed Developer / Diagnostic group or show them only with dev=1 or super_admin role after Phase 14.",
      keep_for_diagnostics: [
        "Context Build",
        "Context Preview",
        "Context Assembly",
        "AI Pipeline Draft",
        "AI Response Test",
        "Response Storage",
        "Summary Worker",
        "Phase 10 Final"
      ],
      daily_operation_menus: [
        "Daily Health Check",
        "Daily Operation Checklist",
        "Daily Automation",
        "Operation Logs & Safety",
        "Operation Report"
      ]
    },
    phase10_completed_items: [
      "Context Build API",
      "Context Preview Advanced",
      "AI Request Pipeline Draft",
      "Context Assembly Advanced",
      "Memory Context Response Test",
      "Response Storage Hardening",
      "Summary Worker Integration",
      "Phase 10 Final Decision"
    ],
    phase11_entry_scope: [
      "GPT / Claude / Gemini provider abstraction",
      "model profile management",
      "provider-specific request payload mapping",
      "fallback routing and provider health check",
      "multi-model response comparison test",
      "cost / latency / error tracking per provider"
    ],
    recommended_next_action: allowed
      ? "Start Phase 11-1: Multi-model Provider Interface and Model Profile Normalization."
      : "Fix failed Phase 10 items, then rerun Phase 10 Final Decision with smoke test and summary batch processing enabled."
  };
}

async function getPhase10CompletionReport(options = {}) {
  const project_code = options.project_code || "rbs_ai_memory";
  const session_id = options.session_id || "phase-10-final-decision-test";
  const question = options.question || "Phase 10 completion report check.";

  const decision = await runPhase10FinalDecision({
    project_code,
    session_id,
    question,
    run_response_smoke_test: normalizeBoolean(options.run_response_smoke_test, false),
    save_smoke_test_to_memory: normalizeBoolean(options.save_smoke_test_to_memory, false),
    process_summary_batch: normalizeBoolean(options.process_summary_batch, false),
    summary_batch_limit: options.summary_batch_limit || 3
  });

  const report = buildPhase10CompletionPlan(decision);

  return {
    ok: true,
    phase_code: "phase_10",
    report_generated_at: new Date().toISOString(),
    project_code,
    session_id,
    completion_report: report,
    final_decision_snapshot: {
      decision_status: decision.decision_status,
      phase11_entry_allowed: decision.phase11_entry_allowed,
      decision_message: decision.decision_message,
      completion: decision.completion,
      warnings: decision.warnings,
      errors: decision.errors,
      readiness_summary: decision.readiness_summary
    },
    next_step: report.recommended_next_action
  };
}

module.exports = {
  getPhase10CompletionReport
};
