const {
  getProviderCatalog,
  getOpenAiLiveStatus,
  getAnthropicLiveStatus,
  getGeminiLiveStatus,
  testProviderAdapter
} = require("./model-provider.service");

function isTruthy(value) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "yes" || value === "on";
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProvider(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (["openai", "gpt"].includes(value)) return "openai";
  if (["anthropic", "claude"].includes(value)) return "anthropic";
  if (["google", "gemini"].includes(value)) return "google";
  if (["mock", "test"].includes(value)) return "mock";
  return value || "mock";
}

function normalizeIntent(intent) {
  const value = String(intent || "general").trim().toLowerCase();
  const aliases = {
    default: "general",
    normal: "general",
    answer: "general",
    fast: "speed",
    cheap: "cost",
    economical: "cost",
    think: "reasoning",
    analysis: "reasoning",
    long: "long_context",
    memory: "long_context",
    code: "coding",
    dev: "coding",
    safe: "safety",
    fallback: "reliability"
  };
  return aliases[value] || value;
}

const ROUTING_RULES = [
  {
    intent: "general",
    description: "일반 응답 기본 라우팅입니다.",
    priority: ["openai", "anthropic", "google", "mock"],
    default_model_env: ["OPENAI_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_MODEL", "GEMINI_DEFAULT_MODEL"]
  },
  {
    intent: "reasoning",
    description: "복잡한 추론, 계획, 코드 분석에 우선 적용합니다.",
    priority: ["openai", "anthropic", "google", "mock"],
    default_model_env: ["OPENAI_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_MODEL", "GEMINI_DEFAULT_MODEL"]
  },
  {
    intent: "long_context",
    description: "긴 memory context, 대량 문맥 조립에 우선 적용합니다.",
    priority: ["anthropic", "google", "openai", "mock"],
    default_model_env: ["ANTHROPIC_DEFAULT_MODEL", "GEMINI_DEFAULT_MODEL", "OPENAI_DEFAULT_MODEL"]
  },
  {
    intent: "speed",
    description: "짧은 응답, 빠른 처리, 운영 상태 확인에 우선 적용합니다.",
    priority: ["google", "openai", "anthropic", "mock"],
    default_model_env: ["GEMINI_DEFAULT_MODEL", "OPENAI_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_MODEL"]
  },
  {
    intent: "cost",
    description: "비용 민감 작업, 반복 테스트에 우선 적용합니다.",
    priority: ["google", "mock", "openai", "anthropic"],
    default_model_env: ["GEMINI_DEFAULT_MODEL", "OPENAI_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_MODEL"]
  },
  {
    intent: "coding",
    description: "개발, 코드 리뷰, 패치 설계 작업에 우선 적용합니다.",
    priority: ["openai", "anthropic", "google", "mock"],
    default_model_env: ["OPENAI_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_MODEL", "GEMINI_DEFAULT_MODEL"]
  },
  {
    intent: "safety",
    description: "운영 안전 점검, 보안 관련 판단에 우선 적용합니다.",
    priority: ["openai", "anthropic", "mock", "google"],
    default_model_env: ["OPENAI_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_MODEL", "GEMINI_DEFAULT_MODEL"]
  },
  {
    intent: "reliability",
    description: "provider 장애 시 fallback 안정성을 우선합니다.",
    priority: ["openai", "anthropic", "google", "mock"],
    default_model_env: ["OPENAI_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_MODEL", "GEMINI_DEFAULT_MODEL"]
  }
];

function getRuleForIntent(intent) {
  const normalizedIntent = normalizeIntent(intent);
  return ROUTING_RULES.find((rule) => rule.intent === normalizedIntent) || ROUTING_RULES[0];
}

function getDefaultModelForProvider(provider) {
  const normalized = normalizeProvider(provider);
  if (normalized === "openai") return process.env.OPENAI_DEFAULT_MODEL || "gpt-5.5";
  if (normalized === "anthropic") return process.env.ANTHROPIC_DEFAULT_MODEL || "claude-sonnet-4-5";
  if (normalized === "google") return process.env.GEMINI_DEFAULT_MODEL || "gemini-2.5-flash";
  return process.env.MOCK_DEFAULT_MODEL || "mock-model";
}

function getProviderAllowed(provider) {
  const normalized = normalizeProvider(provider);
  if (normalized === "openai") return splitCsv(process.env.OPENAI_LIVE_ALLOWED_MODELS);
  if (normalized === "anthropic") return splitCsv(process.env.ANTHROPIC_LIVE_ALLOWED_MODELS);
  if (normalized === "google") return splitCsv(process.env.GEMINI_LIVE_ALLOWED_MODELS);
  return [];
}

async function getProviderSafetySnapshot() {
  const snapshot = {
    openai: null,
    anthropic: null,
    google: null,
    mock: {
      ok: true,
      provider: "mock",
      status: "READY",
      live_config: {
        live_mode_enabled: isTruthy(process.env.AI_LIVE_MODE),
        live_call_allowed: true,
        api_key_configured: true,
        default_model: getDefaultModelForProvider("mock")
      }
    }
  };

  const warnings = [];

  try {
    snapshot.openai = await getOpenAiLiveStatus();
  } catch (error) {
    warnings.push(`OpenAI status failed: ${error.message}`);
    snapshot.openai = { ok: false, provider: "openai", status: "STATUS_ERROR", error: error.message };
  }

  try {
    snapshot.anthropic = await getAnthropicLiveStatus();
  } catch (error) {
    warnings.push(`Anthropic status failed: ${error.message}`);
    snapshot.anthropic = { ok: false, provider: "anthropic", status: "STATUS_ERROR", error: error.message };
  }

  try {
    snapshot.google = await getGeminiLiveStatus();
  } catch (error) {
    warnings.push(`Gemini status failed: ${error.message}`);
    snapshot.google = { ok: false, provider: "google", status: "STATUS_ERROR", error: error.message };
  }

  return { snapshot, warnings };
}

function isProviderLiveReady(provider, statusResult) {
  if (normalizeProvider(provider) === "mock") return true;
  const cfg = statusResult?.live_config || {};
  return Boolean(statusResult?.ok && cfg.live_call_allowed);
}

function buildCandidate(provider, statusResult, { live = false } = {}) {
  const normalized = normalizeProvider(provider);
  const defaultModel = getDefaultModelForProvider(normalized);
  const allowedModels = getProviderAllowed(normalized);
  const liveReady = isProviderLiveReady(normalized, statusResult);

  return {
    provider: normalized,
    model_name: defaultModel,
    live_ready: liveReady,
    selectable: live ? liveReady : true,
    status: statusResult?.status || (normalized === "mock" ? "READY" : "UNKNOWN"),
    allowed_models: allowedModels,
    reason: live && !liveReady ? "Live call requested but provider safety gate is not ready." : "Candidate is selectable."
  };
}

function uniqueProviders(providers) {
  const seen = new Set();
  const result = [];
  for (const provider of providers) {
    const normalized = normalizeProvider(provider);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

async function getProviderRouterStatus() {
  const catalog = await getProviderCatalog();
  const { snapshot, warnings } = await getProviderSafetySnapshot();
  const config = {
    phase: "11-5",
    ai_live_mode: isTruthy(process.env.AI_LIVE_MODE),
    default_provider: normalizeProvider(process.env.AI_ROUTER_DEFAULT_PROVIDER || "openai"),
    fallback_enabled: !["false", "0", "off"].includes(String(process.env.AI_ROUTER_FALLBACK_ENABLED || "true").toLowerCase()),
    allowed_providers: splitCsv(process.env.AI_ROUTER_ALLOWED_PROVIDERS || "openai,anthropic,google,mock").map(normalizeProvider),
    live_required_by_default: isTruthy(process.env.AI_ROUTER_REQUIRE_LIVE),
    rules_count: ROUTING_RULES.length
  };

  const providers = ["openai", "anthropic", "google", "mock"].map((provider) => buildCandidate(provider, snapshot[provider], { live: config.live_required_by_default }));

  return {
    ok: true,
    phase: "11-5",
    status: warnings.length ? "READY_WITH_WARNINGS" : "READY",
    config,
    providers,
    catalog,
    warnings
  };
}

async function selectProviderRoute({
  intent = "general",
  preferred_provider = null,
  force_provider = null,
  model_name = null,
  live = false,
  require_live = null,
  allow_fallback = true,
  prompt = ""
} = {}) {
  const normalizedIntent = normalizeIntent(intent);
  const rule = getRuleForIntent(normalizedIntent);
  const liveRequired = require_live === null || require_live === undefined ? Boolean(live) : isTruthy(require_live);
  const fallbackEnabled = allow_fallback !== false && !["false", "0", "off"].includes(String(process.env.AI_ROUTER_FALLBACK_ENABLED || "true").toLowerCase());
  const allowedProviders = splitCsv(process.env.AI_ROUTER_ALLOWED_PROVIDERS || "openai,anthropic,google,mock").map(normalizeProvider);
  const defaultProvider = normalizeProvider(process.env.AI_ROUTER_DEFAULT_PROVIDER || rule.priority[0] || "openai");

  const basePriority = force_provider
    ? [normalizeProvider(force_provider)]
    : uniqueProviders([
        preferred_provider,
        defaultProvider,
        ...rule.priority,
        "mock"
      ].filter(Boolean));

  const orderedProviders = basePriority.filter((provider) => allowedProviders.includes(provider) || provider === "mock");
  const { snapshot, warnings } = await getProviderSafetySnapshot();
  const candidates = orderedProviders.map((provider) => buildCandidate(provider, snapshot[provider], { live: liveRequired }));

  const routingTrace = [];
  let selected = null;

  for (const candidate of candidates) {
    const forced = force_provider && candidate.provider === normalizeProvider(force_provider);
    const selectedModel = model_name && (forced || candidate.provider === normalizeProvider(preferred_provider || force_provider))
      ? model_name
      : candidate.model_name;

    const enrichedCandidate = {
      ...candidate,
      model_name: selectedModel,
      prompt_chars: String(prompt || "").length
    };

    if (liveRequired && !candidate.live_ready) {
      routingTrace.push({ provider: candidate.provider, decision: "SKIPPED", reason: candidate.reason });
      if (!fallbackEnabled || forced) break;
      continue;
    }

    routingTrace.push({ provider: candidate.provider, decision: "SELECTED", reason: candidate.reason });
    selected = enrichedCandidate;
    break;
  }

  const fallbackChain = candidates
    .filter((candidate) => !selected || candidate.provider !== selected.provider)
    .map((candidate) => ({
      provider: candidate.provider,
      model_name: candidate.model_name,
      live_ready: candidate.live_ready,
      status: candidate.status
    }));

  const errors = [];
  if (!selected) {
    errors.push("No provider route could be selected with the current safety and routing constraints.");
  }

  const routeStatus = selected
    ? (warnings.length ? "SELECTED_WITH_WARNINGS" : "SELECTED")
    : "NO_PROVIDER_AVAILABLE";

  return {
    ok: Boolean(selected),
    phase: "11-5",
    route_status: routeStatus,
    intent: normalizedIntent,
    rule,
    selected_provider: selected?.provider || null,
    selected_model: selected?.model_name || null,
    live_requested: Boolean(live),
    live_required: liveRequired,
    fallback_enabled: fallbackEnabled,
    selected_route: selected,
    fallback_chain: fallbackChain,
    candidates,
    routing_trace: routingTrace,
    safety_snapshot: snapshot,
    warnings,
    errors,
    recommended_action: selected
      ? "Use selected_provider and selected_model for the next AI request pipeline step."
      : "Disable require_live, enable a provider safety gate, correct API keys, or allow mock fallback."
  };
}

function normalizeProviderList(list) {
  if (Array.isArray(list)) return list.map(normalizeProvider).filter(Boolean);
  return splitCsv(list).map(normalizeProvider).filter(Boolean);
}

function getFallbackScenarioDefinitions() {
  return {
    ok: true,
    phase: "11-7",
    scenarios: [
      {
        key: "openai_to_fallback",
        title: "OpenAI unavailable → fallback provider selected",
        intent: "reasoning",
        preferred_provider: "openai",
        blocked_providers: ["openai"],
        live: false,
        allow_fallback: true
      },
      {
        key: "anthropic_long_context_to_fallback",
        title: "Anthropic long-context route unavailable → fallback provider selected",
        intent: "long_context",
        preferred_provider: "anthropic",
        blocked_providers: ["anthropic"],
        live: false,
        allow_fallback: true
      },
      {
        key: "gemini_speed_to_fallback",
        title: "Gemini speed route unavailable → fallback provider selected",
        intent: "speed",
        preferred_provider: "google",
        blocked_providers: ["google"],
        live: false,
        allow_fallback: true
      },
      {
        key: "all_live_providers_to_mock",
        title: "All live providers unavailable → mock fallback selected",
        intent: "reliability",
        preferred_provider: "openai",
        blocked_providers: ["openai", "anthropic", "google"],
        live: false,
        allow_fallback: true
      },
      {
        key: "forced_provider_blocked_no_fallback",
        title: "Forced provider unavailable with fallback disabled → route blocked",
        intent: "general",
        force_provider: "openai",
        blocked_providers: ["openai"],
        live: false,
        allow_fallback: false,
        expected_failure: true
      }
    ],
    usage: {
      endpoint: "POST /ai/model/router/fallback-test",
      example_body: {
        intent: "reasoning",
        preferred_provider: "openai",
        blocked_providers: ["openai"],
        live: false,
        allow_fallback: true,
        execute_test: true
      }
    }
  };
}

async function selectProviderRouteWithFallbackSimulation(options = {}) {
  const blockedProviders = normalizeProviderList(options.blocked_providers || options.simulate_unavailable_providers || []);
  const route = await selectProviderRoute(options);

  // If there is no simulation, return the normal route.
  if (!blockedProviders.length) {
    return {
      ...route,
      phase: "11-7",
      fallback_test_mode: "normal_router_selection",
      simulated_blocked_providers: []
    };
  }

  const normalizedIntent = normalizeIntent(options.intent || "general");
  const rule = getRuleForIntent(normalizedIntent);
  const liveRequired = options.require_live === null || options.require_live === undefined ? Boolean(options.live) : isTruthy(options.require_live);
  const fallbackEnabled = options.allow_fallback !== false && !["false", "0", "off"].includes(String(process.env.AI_ROUTER_FALLBACK_ENABLED || "true").toLowerCase());
  const allowedProviders = splitCsv(process.env.AI_ROUTER_ALLOWED_PROVIDERS || "openai,anthropic,google,mock").map(normalizeProvider);
  const defaultProvider = normalizeProvider(process.env.AI_ROUTER_DEFAULT_PROVIDER || rule.priority[0] || "openai");

  const basePriority = options.force_provider
    ? [normalizeProvider(options.force_provider)]
    : uniqueProviders([
        options.preferred_provider,
        defaultProvider,
        ...rule.priority,
        "mock"
      ].filter(Boolean));

  const orderedProviders = basePriority.filter((provider) => allowedProviders.includes(provider) || provider === "mock");
  const { snapshot, warnings } = await getProviderSafetySnapshot();
  const candidates = orderedProviders.map((provider) => buildCandidate(provider, snapshot[provider], { live: liveRequired }));

  const routingTrace = [];
  let selected = null;

  for (const candidate of candidates) {
    const forced = options.force_provider && candidate.provider === normalizeProvider(options.force_provider);
    const selectedModel = options.model_name && (forced || candidate.provider === normalizeProvider(options.preferred_provider || options.force_provider))
      ? options.model_name
      : candidate.model_name;

    const enrichedCandidate = {
      ...candidate,
      model_name: selectedModel,
      prompt_chars: String(options.prompt || "").length,
      simulated_blocked: blockedProviders.includes(candidate.provider)
    };

    if (blockedProviders.includes(candidate.provider)) {
      routingTrace.push({
        provider: candidate.provider,
        decision: "SKIPPED_SIMULATED_UNAVAILABLE",
        reason: "Phase 11-7 fallback test intentionally marked this provider unavailable."
      });
      if (!fallbackEnabled || forced) break;
      continue;
    }

    if (liveRequired && !candidate.live_ready) {
      routingTrace.push({ provider: candidate.provider, decision: "SKIPPED", reason: candidate.reason });
      if (!fallbackEnabled || forced) break;
      continue;
    }

    routingTrace.push({ provider: candidate.provider, decision: "SELECTED", reason: candidate.reason });
    selected = enrichedCandidate;
    break;
  }

  const fallbackChain = candidates
    .filter((candidate) => !selected || candidate.provider !== selected.provider)
    .map((candidate) => ({
      provider: candidate.provider,
      model_name: candidate.model_name,
      live_ready: candidate.live_ready,
      status: candidate.status,
      simulated_blocked: blockedProviders.includes(candidate.provider)
    }));

  const errors = [];
  if (!selected) {
    errors.push("No provider route could be selected after applying fallback simulation constraints.");
  }

  const routeStatus = selected
    ? (warnings.length ? "FALLBACK_SELECTED_WITH_WARNINGS" : "FALLBACK_SELECTED")
    : "FALLBACK_BLOCKED";

  return {
    ok: Boolean(selected),
    phase: "11-7",
    fallback_test_mode: "simulated_provider_unavailability",
    route_status: routeStatus,
    intent: normalizedIntent,
    rule,
    selected_provider: selected?.provider || null,
    selected_model: selected?.model_name || null,
    live_requested: Boolean(options.live),
    live_required: liveRequired,
    fallback_enabled: fallbackEnabled,
    simulated_blocked_providers: blockedProviders,
    selected_route: selected,
    fallback_chain: fallbackChain,
    candidates,
    routing_trace: routingTrace,
    safety_snapshot: snapshot,
    warnings,
    errors,
    baseline_route_without_simulation: route,
    recommended_action: selected
      ? "Fallback route selected. Use this provider/model for routed response execution."
      : "Enable fallback, remove force_provider, unblock a provider, or allow mock provider fallback."
  };
}

async function runProviderFallbackTest({
  intent = "general",
  preferred_provider = null,
  force_provider = null,
  model_name = null,
  prompt = "Phase 11-7 provider fallback test.",
  live = false,
  require_live = null,
  allow_fallback = true,
  blocked_providers = [],
  execute_test = false
} = {}) {
  const route = await selectProviderRouteWithFallbackSimulation({
    intent,
    preferred_provider,
    force_provider,
    model_name,
    prompt,
    live,
    require_live,
    allow_fallback,
    blocked_providers
  });

  let providerTest = null;
  if (route.ok && execute_test) {
    providerTest = await testProviderAdapter({
      provider: route.selected_provider,
      model_name: route.selected_model,
      prompt,
      live
    });
  }

  return {
    ok: route.ok,
    phase: "11-7",
    fallback_test_status: route.ok
      ? (providerTest ? "FALLBACK_SELECTED_AND_TESTED" : "FALLBACK_SELECTED_DRY_RUN")
      : "FALLBACK_SELECTION_FAILED",
    route,
    provider_test: providerTest
  };
}

async function runProviderFallbackMatrix({ execute_test = false, live = false } = {}) {
  const definitions = getFallbackScenarioDefinitions().scenarios;
  const results = [];

  for (const scenario of definitions) {
    const result = await runProviderFallbackTest({
      ...scenario,
      prompt: `Phase 11-7 fallback matrix scenario: ${scenario.title}`,
      live: scenario.live ?? live,
      execute_test
    });

    const expectedFailure = Boolean(scenario.expected_failure);
    const scenarioPassed = expectedFailure ? !result.ok : result.ok;

    results.push({
      scenario_key: scenario.key,
      title: scenario.title,
      expected_failure: expectedFailure,
      passed: scenarioPassed,
      selected_provider: result.route?.selected_provider || null,
      selected_model: result.route?.selected_model || null,
      route_status: result.route?.route_status || null,
      blocked_providers: scenario.blocked_providers || [],
      result
    });
  }

  const passedCount = results.filter((item) => item.passed).length;
  const failedCount = results.length - passedCount;

  return {
    ok: failedCount === 0,
    phase: "11-7",
    matrix_status: failedCount === 0 ? "FALLBACK_MATRIX_PASSED" : "FALLBACK_MATRIX_HAS_FAILURES",
    total: results.length,
    passed_count: passedCount,
    failed_count: failedCount,
    execute_test: Boolean(execute_test),
    live_requested: Boolean(live),
    results,
    recommended_action: failedCount === 0
      ? "Fallback behavior is ready for Phase 11 Final verification."
      : "Review failed fallback scenarios before Phase 11 Final."
  };
}

async function getPhase11FinalPreparation({ run_fallback_matrix = false, execute_test = false } = {}) {
  const routerStatus = await getProviderRouterStatus();
  const rules = getProviderRoutingRules();
  const fallbackScenarios = getFallbackScenarioDefinitions();
  const fallbackMatrix = run_fallback_matrix ? await runProviderFallbackMatrix({ execute_test, live: false }) : null;

  const providerReadiness = (routerStatus.providers || []).map((provider) => ({
    provider: provider.provider,
    status: provider.status,
    live_ready: provider.live_ready,
    selectable_dry_run: provider.selectable,
    model_name: provider.model_name
  }));

  const liveReadyCount = providerReadiness.filter((item) => item.provider !== "mock" && item.live_ready).length;
  const routerReady = Boolean(routerStatus.ok && ["READY", "READY_WITH_WARNINGS"].includes(routerStatus.status));
  const fallbackReady = fallbackMatrix ? fallbackMatrix.ok : true;
  const finalPrepStatus = routerReady && fallbackReady
    ? (routerStatus.warnings?.length ? "READY_WITH_WARNINGS" : "READY_FOR_PHASE_11_FINAL")
    : "NEEDS_FIX_BEFORE_PHASE_11_FINAL";

  const warnings = [];
  if (!liveReadyCount) warnings.push("No live provider is currently ready. Mock/dry-run routing works, but live multi-model operations require at least one live provider.");
  if (!run_fallback_matrix) warnings.push("Fallback matrix was not executed in this preparation check. Run POST /ai/model/router/fallback-matrix for full verification.");
  if (routerStatus.warnings?.length) warnings.push(...routerStatus.warnings);

  return {
    ok: finalPrepStatus !== "NEEDS_FIX_BEFORE_PHASE_11_FINAL",
    phase: "11-7",
    final_prep_status: finalPrepStatus,
    phase11_final_ready: finalPrepStatus === "READY_FOR_PHASE_11_FINAL" || finalPrepStatus === "READY_WITH_WARNINGS",
    router_ready: routerReady,
    fallback_ready: fallbackReady,
    live_provider_ready_count: liveReadyCount,
    provider_readiness: providerReadiness,
    router_status: routerStatus,
    routing_rules_count: rules.rules.length,
    fallback_scenarios_count: fallbackScenarios.scenarios.length,
    fallback_matrix: fallbackMatrix,
    warnings,
    recommended_next_step: finalPrepStatus === "NEEDS_FIX_BEFORE_PHASE_11_FINAL"
      ? "Fix provider router or fallback matrix failures, then run Phase 11 Final."
      : "Proceed to Phase 11 Final: Multi-model provider completion decision."
  };
}

async function testProviderRouter({
  intent = "general",
  preferred_provider = null,
  force_provider = null,
  model_name = null,
  prompt = "Phase 11-5 provider router test.",
  live = false,
  require_live = null,
  allow_fallback = true,
  execute_test = false
} = {}) {
  const route = await selectProviderRoute({
    intent,
    preferred_provider,
    force_provider,
    model_name,
    live,
    require_live,
    allow_fallback,
    prompt
  });

  let providerTest = null;
  if (route.ok && execute_test) {
    providerTest = await testProviderAdapter({
      provider: route.selected_provider,
      model_name: route.selected_model,
      prompt,
      live
    });
  }

  return {
    ok: route.ok,
    phase: "11-5",
    router_test_status: route.ok ? (providerTest ? "ROUTE_SELECTED_AND_TESTED" : "ROUTE_SELECTED_DRY_RUN") : "ROUTE_SELECTION_FAILED",
    route,
    provider_test: providerTest
  };
}

function getProviderRoutingRules() {
  return {
    ok: true,
    phase: "11-5",
    rules: ROUTING_RULES,
    env_keys: {
      default_provider: "AI_ROUTER_DEFAULT_PROVIDER",
      allowed_providers: "AI_ROUTER_ALLOWED_PROVIDERS",
      fallback_enabled: "AI_ROUTER_FALLBACK_ENABLED",
      require_live: "AI_ROUTER_REQUIRE_LIVE"
    },
    recommended_env: {
      AI_ROUTER_DEFAULT_PROVIDER: "openai",
      AI_ROUTER_ALLOWED_PROVIDERS: "openai,anthropic,google,mock",
      AI_ROUTER_FALLBACK_ENABLED: "true",
      AI_ROUTER_REQUIRE_LIVE: "false"
    }
  };
}

module.exports = {
  normalizeIntent,
  getProviderRoutingRules,
  getProviderRouterStatus,
  selectProviderRoute,
  testProviderRouter,
  getFallbackScenarioDefinitions,
  selectProviderRouteWithFallbackSimulation,
  runProviderFallbackTest,
  runProviderFallbackMatrix,
  getPhase11FinalPreparation
};
