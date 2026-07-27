require("dotenv").config();
const pool = require("../config/db");

const PROVIDER_CATALOG = [
  {
    provider: "openai",
    provider_name: "OpenAI",
    env_key: "OPENAI_API_KEY",
    default_model: process.env.OPENAI_DEFAULT_MODEL || process.env.DEFAULT_MODEL || "gpt-5.5",
    live_supported: true,
    sdk_required: "openai",
    status: process.env.OPENAI_API_KEY ? "CONFIGURED" : "MISSING_API_KEY",
    notes: "Phase 11-2 enables guarded OpenAI live calls. AI_LIVE_MODE and OPENAI_LIVE_ENABLED must both be enabled."
  },
  {
    provider: "anthropic",
    provider_name: "Claude / Anthropic",
    env_key: "ANTHROPIC_API_KEY",
    default_model: process.env.ANTHROPIC_DEFAULT_MODEL || process.env.CLAUDE_DEFAULT_MODEL || "claude-sonnet-4-5",
    live_supported: true,
    sdk_required: "fetch",
    status: process.env.ANTHROPIC_API_KEY ? "CONFIGURED" : "MISSING_API_KEY",
    notes: "Phase 11-3 enables guarded Anthropic Messages API live calls. AI_LIVE_MODE and ANTHROPIC_LIVE_ENABLED must both be enabled."
  },
  {
    provider: "google",
    provider_name: "Gemini / Google",
    env_key: "GEMINI_API_KEY",
    default_model: process.env.GEMINI_DEFAULT_MODEL || process.env.GOOGLE_DEFAULT_MODEL || "gemini-2.5-flash",
    live_supported: true,
    sdk_required: "fetch",
    status: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) ? "CONFIGURED" : "MISSING_API_KEY",
    notes: "Phase 11-4 enables guarded Gemini generateContent live calls. AI_LIVE_MODE and GEMINI_LIVE_ENABLED must both be enabled."
  },
  {
    provider: "lmstudio",
    provider_name: "LM Studio",
    env_key: "LMSTUDIO_BASE_URL",
    default_model: process.env.LMSTUDIO_MODEL || "google/gemma-4-e2b",
    live_supported: true,
    sdk_required: "openai",
    status: process.env.LMSTUDIO_BASE_URL ? "CONFIGURED" : "MISSING_BASE_URL",
    notes: "LM Studio exposes an OpenAI-compatible local endpoint. AI_LIVE_MODE and LMSTUDIO_LIVE_ENABLED must both be enabled."
  },
  {
    provider: "mock",
    provider_name: "Mock Provider",
    env_key: null,
    default_model: "mock-memory-model",
    live_supported: true,
    sdk_required: null,
    status: "READY",
    notes: "Safe dry-run provider used when live mode is disabled."
  }
];

function isTruthy(value) {
  return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true" || String(value || "").toLowerCase() === "yes" || String(value || "").toLowerCase() === "on";
}

function normalizeProvider(provider) {
  const raw = String(provider || "").trim().toLowerCase();

  if (["openai", "gpt", "chatgpt"].includes(raw)) return "openai";
  if (["anthropic", "claude"].includes(raw)) return "anthropic";
  if (["google", "gemini"].includes(raw)) return "google";
  if (["lmstudio", "lm-studio", "lm studio"].includes(raw)) return "lmstudio";
  if (["mock", "test", "dry_run", "dry-run"].includes(raw)) return "mock";

  return raw || "mock";
}

function parseJsonMaybe(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function parseNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getCsvEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeModelProfile(row = {}) {
  const provider = normalizeProvider(row.provider || row.provider_name || row.model_provider);
  const modelName = row.model_name || row.model || row.target_model || PROVIDER_CATALOG.find(p => p.provider === provider)?.default_model || "mock-memory-model";
  const modelCode = row.model_code || row.code || `${provider}_${String(modelName).replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}`;

  const capabilities = parseJsonMaybe(row.capabilities_json || row.capabilities || row.tags_json, null) || {
    text_generation: true,
    context_aware_response: true,
    memory_gateway_compatible: true,
    tool_calling: Boolean(row.supports_tools || row.tool_calling),
    vision: Boolean(row.supports_vision || row.vision),
    embeddings: Boolean(row.supports_embeddings || row.embeddings)
  };

  return {
    id: row.id ?? null,
    model_code: modelCode,
    provider,
    provider_name: PROVIDER_CATALOG.find(p => p.provider === provider)?.provider_name || provider,
    model_name: modelName,
    display_name: row.display_name || row.name || `${provider}:${modelName}`,
    description: row.description || row.notes || "",
    priority: parseNumber(row.priority, 0),
    temperature_default: parseNumber(row.temperature_default ?? row.temperature, 0.3),
    max_input_tokens: parseNumber(row.max_input_tokens ?? row.context_window ?? row.max_tokens, 16000),
    max_output_tokens: parseNumber(row.max_output_tokens ?? row.output_tokens, 2000),
    cost_tier: row.cost_tier || row.cost_level || "unknown",
    routing_group: row.routing_group || row.group_name || "default",
    capabilities,
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    raw: row
  };
}

function getLiveModeConfig() {
  const allowedModels = getCsvEnv("OPENAI_LIVE_ALLOWED_MODELS");
  const liveModeEnabled = isTruthy(process.env.AI_LIVE_MODE);
  const openaiLiveEnabled = isTruthy(process.env.OPENAI_LIVE_ENABLED);
  const apiKeyConfigured = Boolean(process.env.OPENAI_API_KEY);

  return {
    live_mode_enabled: liveModeEnabled,
    openai_live_enabled: openaiLiveEnabled,
    api_key_configured: apiKeyConfigured,
    live_call_allowed: liveModeEnabled && openaiLiveEnabled && apiKeyConfigured,
    default_model: process.env.OPENAI_DEFAULT_MODEL || process.env.DEFAULT_MODEL || "gpt-5.5",
    allowed_models: allowedModels,
    allowed_models_enforced: allowedModels.length > 0,
    max_prompt_chars: parseNumber(process.env.OPENAI_LIVE_MAX_PROMPT_CHARS, 12000),
    timeout_ms: parseNumber(process.env.OPENAI_LIVE_TIMEOUT_MS, 60000),
    max_output_tokens: parseNumber(process.env.OPENAI_MAX_OUTPUT_TOKENS, 1500),
    send_temperature: isTruthy(process.env.OPENAI_SEND_TEMPERATURE),
    sdk_package: "openai",
    safety_notes: [
      "Live OpenAI calls require AI_LIVE_MODE=true and OPENAI_LIVE_ENABLED=true.",
      "OPENAI_API_KEY must be configured in .env.",
      "OPENAI_LIVE_MAX_PROMPT_CHARS protects against unexpectedly large prompts.",
      "OPENAI_LIVE_ALLOWED_MODELS can restrict which models are allowed for live calls."
    ]
  };
}

function getAnthropicLiveConfig() {
  const allowedModels = getCsvEnv("ANTHROPIC_LIVE_ALLOWED_MODELS");
  const liveModeEnabled = isTruthy(process.env.AI_LIVE_MODE);
  const anthropicLiveEnabled = isTruthy(process.env.ANTHROPIC_LIVE_ENABLED);
  const apiKeyConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return {
    live_mode_enabled: liveModeEnabled,
    anthropic_live_enabled: anthropicLiveEnabled,
    api_key_configured: apiKeyConfigured,
    live_call_allowed: liveModeEnabled && anthropicLiveEnabled && apiKeyConfigured,
    default_model: process.env.ANTHROPIC_DEFAULT_MODEL || process.env.CLAUDE_DEFAULT_MODEL || "claude-sonnet-4-5",
    allowed_models: allowedModels,
    allowed_models_enforced: allowedModels.length > 0,
    max_prompt_chars: parseNumber(process.env.ANTHROPIC_LIVE_MAX_PROMPT_CHARS, 12000),
    timeout_ms: parseNumber(process.env.ANTHROPIC_LIVE_TIMEOUT_MS, 60000),
    max_output_tokens: parseNumber(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 1500),
    api_version: process.env.ANTHROPIC_VERSION || "2023-06-01",
    endpoint: process.env.ANTHROPIC_API_BASE_URL || "https://api.anthropic.com/v1/messages",
    safety_notes: [
      "Live Anthropic calls require AI_LIVE_MODE=true and ANTHROPIC_LIVE_ENABLED=true.",
      "ANTHROPIC_API_KEY must be configured in .env.",
      "ANTHROPIC_LIVE_MAX_PROMPT_CHARS protects against unexpectedly large prompts.",
      "ANTHROPIC_LIVE_ALLOWED_MODELS can restrict which Claude models are allowed for live calls.",
      "ANTHROPIC_VERSION defaults to 2023-06-01."
    ]
  };
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function getGeminiLiveConfig() {
  const allowedModels = getCsvEnv("GEMINI_LIVE_ALLOWED_MODELS").length
    ? getCsvEnv("GEMINI_LIVE_ALLOWED_MODELS")
    : getCsvEnv("GOOGLE_LIVE_ALLOWED_MODELS");
  const liveModeEnabled = isTruthy(process.env.AI_LIVE_MODE);
  const geminiLiveEnabled = isTruthy(process.env.GEMINI_LIVE_ENABLED || process.env.GOOGLE_LIVE_ENABLED);
  const apiKeyConfigured = Boolean(getGeminiApiKey());

  return {
    live_mode_enabled: liveModeEnabled,
    gemini_live_enabled: geminiLiveEnabled,
    api_key_configured: apiKeyConfigured,
    live_call_allowed: liveModeEnabled && geminiLiveEnabled && apiKeyConfigured,
    default_model: process.env.GEMINI_DEFAULT_MODEL || process.env.GOOGLE_DEFAULT_MODEL || "gemini-2.5-flash",
    allowed_models: allowedModels,
    allowed_models_enforced: allowedModels.length > 0,
    max_prompt_chars: parseNumber(process.env.GEMINI_LIVE_MAX_PROMPT_CHARS || process.env.GOOGLE_LIVE_MAX_PROMPT_CHARS, 12000),
    timeout_ms: parseNumber(process.env.GEMINI_LIVE_TIMEOUT_MS || process.env.GOOGLE_LIVE_TIMEOUT_MS, 60000),
    max_output_tokens: parseNumber(process.env.GEMINI_MAX_OUTPUT_TOKENS || process.env.GOOGLE_MAX_OUTPUT_TOKENS, 1500),
    api_version: process.env.GEMINI_API_VERSION || "v1beta",
    endpoint_base: process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com",
    safety_notes: [
      "Live Gemini calls require AI_LIVE_MODE=true and GEMINI_LIVE_ENABLED=true.",
      "GEMINI_API_KEY or GOOGLE_API_KEY must be configured in .env.",
      "GEMINI_LIVE_MAX_PROMPT_CHARS protects against unexpectedly large prompts.",
      "GEMINI_LIVE_ALLOWED_MODELS can restrict which Gemini models are allowed for live calls.",
      "The adapter uses the Gemini generateContent REST endpoint."
    ]
  };
}

function getLmStudioLiveConfig() {
  const allowedModels = getCsvEnv("LMSTUDIO_LIVE_ALLOWED_MODELS");
  const liveModeEnabled = isTruthy(process.env.AI_LIVE_MODE);
  const lmStudioLiveEnabled = isTruthy(process.env.LMSTUDIO_LIVE_ENABLED);
  const baseUrlConfigured = Boolean(process.env.LMSTUDIO_BASE_URL);

  return {
    live_mode_enabled: liveModeEnabled,
    lmstudio_live_enabled: lmStudioLiveEnabled,
    base_url_configured: baseUrlConfigured,
    live_call_allowed: liveModeEnabled && lmStudioLiveEnabled && baseUrlConfigured,
    default_model: process.env.LMSTUDIO_MODEL || "google/gemma-4-e2b",
    allowed_models: allowedModels,
    allowed_models_enforced: allowedModels.length > 0,
    max_prompt_chars: parseNumber(process.env.LMSTUDIO_LIVE_MAX_PROMPT_CHARS, 12000),
    timeout_ms: parseNumber(process.env.LMSTUDIO_LIVE_TIMEOUT_MS, 60000),
    max_output_tokens: parseNumber(process.env.LMSTUDIO_MAX_OUTPUT_TOKENS, 1500),
    send_temperature: isTruthy(process.env.LMSTUDIO_SEND_TEMPERATURE || process.env.OPENAI_SEND_TEMPERATURE),
    endpoint: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
    safety_notes: [
      "Live LM Studio calls require AI_LIVE_MODE=true and LMSTUDIO_LIVE_ENABLED=true.",
      "LMSTUDIO_BASE_URL must point to the local OpenAI-compatible server.",
      "LMSTUDIO_LIVE_MAX_PROMPT_CHARS protects against unexpectedly large prompts.",
      "LMSTUDIO_LIVE_ALLOWED_MODELS can restrict which local models are allowed for live calls."
    ]
  };
}


async function getProviderCatalog() {
  const liveConfig = getLiveModeConfig();
  const anthropicConfig = getAnthropicLiveConfig();
  const geminiConfig = getGeminiLiveConfig();
  const lmstudioConfig = getLmStudioLiveConfig();

  return PROVIDER_CATALOG.map((provider) => ({
    ...provider,
    api_key_configured: provider.provider === "google"
      ? geminiConfig.api_key_configured
      : provider.provider === "lmstudio"
        ? lmstudioConfig.base_url_configured
        : provider.env_key
          ? Boolean(process.env[provider.env_key])
          : true,
    live_mode_enabled: liveConfig.live_mode_enabled,
    openai_live_enabled: provider.provider === "openai" ? liveConfig.openai_live_enabled : false,
    anthropic_live_enabled: provider.provider === "anthropic" ? anthropicConfig.anthropic_live_enabled : false,
    gemini_live_enabled: provider.provider === "google" ? geminiConfig.gemini_live_enabled : false,
    lmstudio_live_enabled: provider.provider === "lmstudio" ? lmstudioConfig.lmstudio_live_enabled : false,
    live_call_allowed: provider.provider === "openai"
      ? liveConfig.live_call_allowed
      : provider.provider === "anthropic"
        ? anthropicConfig.live_call_allowed
        : provider.provider === "google"
          ? geminiConfig.live_call_allowed
          : provider.provider === "lmstudio"
            ? lmstudioConfig.live_call_allowed
            : provider.provider === "mock"
  }));
}

async function getModelProfileColumns() {
  try {
    const [rows] = await pool.query("SHOW COLUMNS FROM ai_model_profiles");
    return rows.map((row) => row.Field || row.field || row.COLUMN_NAME).filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function listNormalizedModelProfiles({ provider = null, include_inactive = false } = {}) {
  const [rows] = await pool.query("SELECT * FROM ai_model_profiles ORDER BY provider ASC, model_code ASC");

  let normalized = rows.map(normalizeModelProfile);

  if (provider) {
    const wanted = normalizeProvider(provider);
    normalized = normalized.filter((profile) => profile.provider === wanted);
  }

  if (!include_inactive) {
    normalized = normalized.filter((profile) => profile.is_active);
  }

  return normalized;
}

function buildProviderMessages({ system_context_text = "", user_message = "", finalPrompt = "" }) {
  const prompt = finalPrompt || user_message || "";

  return [
    {
      role: "system",
      content: system_context_text || "You are a context-aware business assistant connected to AI Memory Gateway."
    },
    {
      role: "user",
      content: prompt
    }
  ];
}

function buildProviderRequestPreview({ modelProfile, finalPrompt, system_context_text = "" }) {
  const normalized = normalizeModelProfile(modelProfile);
  const messages = buildProviderMessages({ system_context_text, finalPrompt });

  if (normalized.provider === "openai") {
    return {
      provider: "openai",
      endpoint_type: "responses.create",
      fallback_endpoint_type: "chat.completions.create",
      model: normalized.model_name,
      temperature: normalized.temperature_default,
      max_output_tokens: normalized.max_output_tokens,
      messages,
      responses_input: messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    };
  }

  if (normalized.provider === "anthropic") {
    return {
      provider: "anthropic",
      endpoint_type: "messages.create",
      model: normalized.model_name,
      max_tokens: normalized.max_output_tokens,
      system: messages[0].content,
      messages: messages.slice(1)
    };
  }

  if (normalized.provider === "google") {
    return {
      provider: "google",
      endpoint_type: "models.generateContent",
      model: normalized.model_name,
      contents: [
        {
          role: "user",
          parts: [{ text: `${messages[0].content}\n\n${messages[1].content}` }]
        }
      ]
    };
  }

  if (normalized.provider === "lmstudio") {
    return {
      provider: "lmstudio",
      endpoint_type: "chat.completions.create",
      model: normalized.model_name,
      max_tokens: normalized.max_output_tokens,
      messages,
      temperature: normalized.temperature_default
    };
  }

  return {
    provider: "mock",
    endpoint_type: "mock.generate",
    model: normalized.model_name,
    messages
  };
}

function buildMockProviderResponse({ modelProfile, finalPrompt }) {
  const normalized = normalizeModelProfile(modelProfile);

  return {
    provider: normalized.provider,
    model_code: normalized.model_code,
    model_name: normalized.model_name,
    live_call: false,
    answer: `[PHASE 11 PROVIDER INTERFACE TEST]\nProvider: ${normalized.provider}\nModel: ${normalized.model_name}\nModel code: ${normalized.model_code}\n\nThe normalized provider interface received the prompt successfully.\n\nPrompt preview:\n${String(finalPrompt || "").slice(0, 1200)}`,
    storedAssistantMessage: `[MOCK PROVIDER RESPONSE] ${normalized.provider}:${normalized.model_name} completed provider-interface dry run.`
  };
}

function assertOpenAiLiveSafety({ modelProfile, finalPrompt }) {
  const normalized = normalizeModelProfile(modelProfile);
  const liveConfig = getLiveModeConfig();
  const errors = [];
  const warnings = [];

  if (normalized.provider !== "openai") {
    errors.push("Live OpenAI safety check can only run for provider=openai.");
  }

  if (!liveConfig.live_mode_enabled) {
    errors.push("AI_LIVE_MODE is not enabled.");
  }

  if (!liveConfig.openai_live_enabled) {
    errors.push("OPENAI_LIVE_ENABLED is not enabled.");
  }

  if (!liveConfig.api_key_configured) {
    errors.push("OPENAI_API_KEY is not configured.");
  }

  if (!String(finalPrompt || "").trim()) {
    errors.push("finalPrompt is empty.");
  }

  if (String(finalPrompt || "").length > liveConfig.max_prompt_chars) {
    errors.push(`Prompt length exceeds OPENAI_LIVE_MAX_PROMPT_CHARS. length=${String(finalPrompt || "").length}, max=${liveConfig.max_prompt_chars}`);
  }

  if (liveConfig.allowed_models_enforced && !liveConfig.allowed_models.includes(normalized.model_name)) {
    errors.push(`Model ${normalized.model_name} is not in OPENAI_LIVE_ALLOWED_MODELS.`);
  }

  if (!liveConfig.allowed_models_enforced) {
    warnings.push("OPENAI_LIVE_ALLOWED_MODELS is not set. Any selected OpenAI model can be used when live mode is enabled.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    live_config: liveConfig,
    model_profile: normalized,
    prompt_length: String(finalPrompt || "").length
  };
}

function extractResponseText(response) {
  if (!response) return "";
  if (typeof response.output_text === "string") return response.output_text;

  const output = Array.isArray(response.output) ? response.output : [];
  const parts = [];

  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const block of content) {
      if (typeof block.text === "string") parts.push(block.text);
      if (typeof block.content === "string") parts.push(block.content);
    }
  }

  if (parts.length) return parts.join("\n").trim();

  const choiceText = response.choices?.[0]?.message?.content;
  return typeof choiceText === "string" ? choiceText : "";
}

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Live provider call timed out after ${timeoutMs}ms.`)), timeoutMs);
    })
  ]);
}

async function callOpenAiLive({ modelProfile, finalPrompt, system_context_text = "" }) {
  const normalized = normalizeModelProfile(modelProfile);
  const safety = assertOpenAiLiveSafety({ modelProfile: normalized, finalPrompt });

  if (!safety.ok) {
    const error = new Error(`OpenAI live call blocked by safety gate: ${safety.errors.join(" | ")}`);
    error.safety = safety;
    throw error;
  }

  const OpenAI = require("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const requestPreview = buildProviderRequestPreview({ modelProfile: normalized, finalPrompt, system_context_text });
  const liveConfig = getLiveModeConfig();

  let endpointUsed = null;
  let response = null;

  if (openai.responses && typeof openai.responses.create === "function") {
    endpointUsed = "responses.create";
    const payload = {
      model: requestPreview.model,
      input: requestPreview.responses_input,
      max_output_tokens: Math.min(normalized.max_output_tokens || liveConfig.max_output_tokens, liveConfig.max_output_tokens)
    };

    if (liveConfig.send_temperature) {
      payload.temperature = normalized.temperature_default;
    }

    response = await withTimeout(openai.responses.create(payload), liveConfig.timeout_ms);
  } else {
    endpointUsed = "chat.completions.create";
    const payload = {
      model: requestPreview.model,
      messages: requestPreview.messages,
      max_tokens: Math.min(normalized.max_output_tokens || liveConfig.max_output_tokens, liveConfig.max_output_tokens)
    };

    if (liveConfig.send_temperature) {
      payload.temperature = normalized.temperature_default;
    }

    response = await withTimeout(openai.chat.completions.create(payload), liveConfig.timeout_ms);
  }

  const answer = extractResponseText(response);

  return {
    provider: normalized.provider,
    model_code: normalized.model_code,
    model_name: normalized.model_name,
    live_call: true,
    endpoint_used: endpointUsed,
    answer,
    storedAssistantMessage: answer,
    raw_response_id: response?.id || null,
    usage: response?.usage || null,
    safety,
    request_preview: {
      provider: requestPreview.provider,
      endpoint_type: endpointUsed,
      model: requestPreview.model,
      prompt_length: String(finalPrompt || "").length,
      max_output_tokens: Math.min(normalized.max_output_tokens || liveConfig.max_output_tokens, liveConfig.max_output_tokens)
    }
  };
}

async function callProviderModel({ modelProfile, finalPrompt, live = false, system_context_text = "" }) {
  const normalized = normalizeModelProfile(modelProfile);
  const liveModeEnabled = isTruthy(process.env.AI_LIVE_MODE);
  const shouldCallLive = Boolean(live) && liveModeEnabled;

  if (!shouldCallLive) {
    return buildMockProviderResponse({ modelProfile: normalized, finalPrompt });
  }

  if (normalized.provider === "openai") {
    return callOpenAiLive({ modelProfile: normalized, finalPrompt, system_context_text });
  }

  if (normalized.provider === "anthropic") {
    return callAnthropicLive({ modelProfile: normalized, finalPrompt, system_context_text });
  }

  if (normalized.provider === "google") {
    return callGeminiLive({ modelProfile: normalized, finalPrompt, system_context_text });
  }

  if (normalized.provider === "lmstudio") {
    return callLmStudioLive({ modelProfile: normalized, finalPrompt, system_context_text });
  }

  throw new Error(`${normalized.provider} live call is not enabled yet. Use mock mode or continue with the provider-specific Phase 11 connection step.`);
}

async function getOpenAiLiveStatus() {
  const catalog = await getProviderCatalog();
  const profiles = await listNormalizedModelProfiles({ provider: "openai", include_inactive: true }).catch(() => []);
  const liveConfig = getLiveModeConfig();
  const activeOpenAiProfiles = profiles.filter((profile) => profile.is_active);

  return {
    ok: true,
    phase: "11-2",
    provider: "openai",
    status: liveConfig.live_call_allowed ? "READY_FOR_LIVE_TEST" : "NOT_READY",
    live_config: liveConfig,
    catalog_item: catalog.find((item) => item.provider === "openai") || null,
    profiles: {
      count: profiles.length,
      active_count: activeOpenAiProfiles.length,
      active_models: activeOpenAiProfiles.map((profile) => profile.model_name)
    },
    checklist: [
      { key: "ai_live_mode", label: "AI_LIVE_MODE=true", passed: liveConfig.live_mode_enabled },
      { key: "openai_live_enabled", label: "OPENAI_LIVE_ENABLED=true", passed: liveConfig.openai_live_enabled },
      { key: "openai_api_key", label: "OPENAI_API_KEY configured", passed: liveConfig.api_key_configured },
      { key: "prompt_limit", label: "OPENAI_LIVE_MAX_PROMPT_CHARS configured", passed: liveConfig.max_prompt_chars > 0 },
      { key: "timeout", label: "OPENAI_LIVE_TIMEOUT_MS configured", passed: liveConfig.timeout_ms > 0 }
    ],
    recommended_env: {
      AI_LIVE_MODE: "false until live test is needed, then true",
      OPENAI_LIVE_ENABLED: "false until OpenAI live test is needed, then true",
      OPENAI_DEFAULT_MODEL: liveConfig.default_model,
      OPENAI_LIVE_MAX_PROMPT_CHARS: String(liveConfig.max_prompt_chars),
      OPENAI_LIVE_TIMEOUT_MS: String(liveConfig.timeout_ms),
      OPENAI_MAX_OUTPUT_TOKENS: String(liveConfig.max_output_tokens),
      OPENAI_LIVE_ALLOWED_MODELS: liveConfig.allowed_models.join(",") || "optional"
    }
  };
}


function normalizeOpenAiApiError(error) {
  const message = error?.message || String(error || "Unknown OpenAI error");
  const status = error?.status || error?.code || null;
  const isModelNotFound = /model.*does not exist|requested model/i.test(message);

  return {
    ok: false,
    phase: "11-2A",
    provider: "openai",
    adapter_status: isModelNotFound ? "OPENAI_MODEL_NOT_AVAILABLE" : "OPENAI_LIVE_CALL_FAILED",
    live_requested: true,
    http_status: status,
    error: message,
    diagnosis: isModelNotFound
      ? "The OpenAI API call reached OpenAI successfully, but the requested model id is not available to this API key or the model id is invalid."
      : "OpenAI live call failed after passing the local safety gate.",
    recommended_action: isModelNotFound
      ? [
          "Use an API model id that is enabled for your OpenAI project.",
          "Try OPENAI_DEFAULT_MODEL=gpt-5.5 instead of gpt-5.5-thinking.",
          "Call GET /ai/model/openai/available-models to see models visible to this API key.",
          "Set OPENAI_LIVE_ALLOWED_MODELS to the exact model id you will use."
        ]
      : [
          "Check the OpenAI error message and request payload.",
          "Run OpenAI Live Status again.",
          "Retry with live=false to confirm the local adapter path is still healthy."
        ]
  };
}

async function listOpenAiAvailableModels({ limit = 100 } = {}) {
  const liveConfig = getLiveModeConfig();

  if (!liveConfig.api_key_configured) {
    return {
      ok: false,
      phase: "11-2A",
      provider: "openai",
      adapter_status: "OPENAI_API_KEY_MISSING",
      error: "OPENAI_API_KEY is not configured.",
      models: []
    };
  }

  const OpenAI = require("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await withTimeout(openai.models.list(), liveConfig.timeout_ms);
    const data = Array.isArray(response?.data) ? response.data : [];
    const models = data
      .map((model) => ({ id: model.id, owned_by: model.owned_by || null, created: model.created || null }))
      .filter((model) => model.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)));

    return {
      ok: true,
      phase: "11-2A",
      provider: "openai",
      adapter_status: "OPENAI_AVAILABLE_MODELS_LOADED",
      count: models.length,
      live_config: {
        default_model: liveConfig.default_model,
        allowed_models: liveConfig.allowed_models,
        allowed_models_enforced: liveConfig.allowed_models_enforced
      },
      models
    };
  } catch (error) {
    const normalized = normalizeOpenAiApiError(error);
    return {
      ...normalized,
      adapter_status: "OPENAI_AVAILABLE_MODELS_FAILED",
      models: []
    };
  }
}

async function testOpenAiLiveProvider({ model_name = null, prompt = "Phase 11-2 OpenAI live provider safety test.", live = false } = {}) {
  const liveConfig = getLiveModeConfig();
  const modelProfile = normalizeModelProfile({
    model_code: "openai_live_test",
    provider: "openai",
    model_name: model_name || liveConfig.default_model,
    display_name: "OpenAI Live Provider Test",
    max_output_tokens: Math.min(liveConfig.max_output_tokens, 500),
    is_active: true
  });

  const safety = assertOpenAiLiveSafety({ modelProfile, finalPrompt: prompt });
  const request_preview = buildProviderRequestPreview({ modelProfile, finalPrompt: prompt });

  if (!live) {
    return {
      ok: true,
      phase: "11-2",
      provider: "openai",
      adapter_status: "OPENAI_LIVE_DRY_RUN_READY",
      live_requested: false,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      response: buildMockProviderResponse({ modelProfile, finalPrompt: prompt })
    };
  }

  if (!safety.ok) {
    return {
      ok: false,
      phase: "11-2",
      provider: "openai",
      adapter_status: "OPENAI_LIVE_BLOCKED_BY_SAFETY_GATE",
      live_requested: true,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview
    };
  }

  try {
    const response = await callOpenAiLive({ modelProfile, finalPrompt: prompt });

    return {
      ok: true,
      phase: "11-2",
      provider: "openai",
      adapter_status: "OPENAI_LIVE_CALL_COMPLETED",
      live_requested: true,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      response
    };
  } catch (error) {
    const normalizedError = normalizeOpenAiApiError(error);

    return {
      ...normalizedError,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview
    };
  }
}


function assertAnthropicLiveSafety({ modelProfile, finalPrompt }) {
  const normalized = normalizeModelProfile(modelProfile);
  const liveConfig = getAnthropicLiveConfig();
  const errors = [];
  const warnings = [];

  if (normalized.provider !== "anthropic") {
    errors.push("Live Anthropic safety check can only run for provider=anthropic.");
  }

  if (!liveConfig.live_mode_enabled) {
    errors.push("AI_LIVE_MODE is not enabled.");
  }

  if (!liveConfig.anthropic_live_enabled) {
    errors.push("ANTHROPIC_LIVE_ENABLED is not enabled.");
  }

  if (!liveConfig.api_key_configured) {
    errors.push("ANTHROPIC_API_KEY is not configured.");
  }

  if (!String(finalPrompt || "").trim()) {
    errors.push("finalPrompt is empty.");
  }

  if (String(finalPrompt || "").length > liveConfig.max_prompt_chars) {
    errors.push(`Prompt length exceeds ANTHROPIC_LIVE_MAX_PROMPT_CHARS. length=${String(finalPrompt || "").length}, max=${liveConfig.max_prompt_chars}`);
  }

  if (liveConfig.allowed_models_enforced && !liveConfig.allowed_models.includes(normalized.model_name)) {
    errors.push(`Model ${normalized.model_name} is not in ANTHROPIC_LIVE_ALLOWED_MODELS.`);
  }

  if (!liveConfig.allowed_models_enforced) {
    warnings.push("ANTHROPIC_LIVE_ALLOWED_MODELS is not set. Any selected Claude model can be used when live mode is enabled.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    live_config: liveConfig,
    model_profile: normalized,
    prompt_length: String(finalPrompt || "").length
  };
}

function extractAnthropicResponseText(response) {
  const content = Array.isArray(response?.content) ? response.content : [];
  const parts = [];

  for (const block of content) {
    if (typeof block?.text === "string") parts.push(block.text);
  }

  return parts.join("\n").trim();
}

// Only populated when extended thinking is enabled on the request (it isn't, currently) -
// present for symmetry with extractLmStudioReasoningContent so callers that want a reasoning
// trace can read it the same way regardless of which provider answered.
function extractAnthropicReasoningContent(response) {
  const content = Array.isArray(response?.content) ? response.content : [];
  const parts = [];

  for (const block of content) {
    if (block?.type === "thinking" && typeof block?.thinking === "string") parts.push(block.thinking);
  }

  return parts.length ? parts.join("\n").trim() : null;
}

function normalizeAnthropicApiError(error) {
  const message = error?.message || String(error || "Unknown Anthropic error");
  const status = error?.status || error?.http_status || null;
  const isModelNotFound = /model.*not.*found|not found|invalid.*model|does not exist/i.test(message);
  const isAuthError = /authentication|api key|unauthorized|permission/i.test(message);

  return {
    ok: false,
    phase: "11-3",
    provider: "anthropic",
    adapter_status: isModelNotFound ? "ANTHROPIC_MODEL_NOT_AVAILABLE" : isAuthError ? "ANTHROPIC_AUTH_FAILED" : "ANTHROPIC_LIVE_CALL_FAILED",
    live_requested: true,
    http_status: status,
    error: message,
    diagnosis: isModelNotFound
      ? "The Anthropic API call reached Anthropic successfully, but the requested Claude model id is not available to this API key or the model id is invalid."
      : isAuthError
        ? "Anthropic rejected the request because the API key or account permission is invalid."
        : "Anthropic live call failed after passing the local safety gate.",
    recommended_action: isModelNotFound
      ? [
          "Use a Claude model id that is enabled for your Anthropic account.",
          "Call GET /ai/model/anthropic/available-models to see models visible to this API key when supported.",
          "Set ANTHROPIC_DEFAULT_MODEL and ANTHROPIC_LIVE_ALLOWED_MODELS to the exact model id you will use."
        ]
      : [
          "Check ANTHROPIC_API_KEY in .env.",
          "Run Anthropic Live Status again.",
          "Retry with live=false to confirm the local adapter path is still healthy."
        ]
  };
}

async function callAnthropicLive({ modelProfile, finalPrompt, system_context_text = "", tools = null, messages_override = null, max_output_tokens_override = null }) {
  const normalized = normalizeModelProfile(modelProfile);
  const safety = assertAnthropicLiveSafety({ modelProfile: normalized, finalPrompt });

  if (!safety.ok) {
    const error = new Error(`Anthropic live call blocked by safety gate: ${safety.errors.join(" | ")}`);
    error.safety = safety;
    throw error;
  }

  const liveConfig = getAnthropicLiveConfig();
  const requestPreview = buildProviderRequestPreview({ modelProfile: normalized, finalPrompt, system_context_text });
  // The output-token cap is normally the shared ANTHROPIC_MAX_OUTPUT_TOKENS env value
  // (liveConfig.max_output_tokens) - callers with a genuinely larger budget need (e.g. the
  // collab writer) can pass max_output_tokens_override to raise the cap for just that call,
  // without affecting /agent/ask or any other caller that doesn't pass it.
  const outputTokenCap = max_output_tokens_override || liveConfig.max_output_tokens;
  const payload = {
    model: normalized.model_name,
    max_tokens: Math.min(normalized.max_output_tokens || outputTokenCap, outputTokenCap),
    system: requestPreview.system || system_context_text || "You are a context-aware business assistant connected to AI Memory Gateway.",
    messages: messages_override || (requestPreview.messages && requestPreview.messages.length
      ? requestPreview.messages
      : [{ role: "user", content: String(finalPrompt || "") }])
  };

  // Tool-use is opt-in per call (see phase17-personal-agent.service.js's enable_crm_tool
  // flag) - it is never attached automatically, matching how live/provider overrides work.
  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools;
  }

  const response = await withTimeout(fetch(liveConfig.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": liveConfig.api_version
    },
    body: JSON.stringify(payload)
  }), liveConfig.timeout_ms);

  const responseText = await response.text();
  let json = null;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch (_) {
    json = { raw_text: responseText };
  }

  if (!response.ok) {
    const apiError = new Error(json?.error?.message || json?.message || responseText || `Anthropic API returned HTTP ${response.status}`);
    apiError.status = response.status;
    apiError.raw = json;
    throw apiError;
  }

  const answer = extractAnthropicResponseText(json);

  return {
    provider: normalized.provider,
    model_code: normalized.model_code,
    model_name: normalized.model_name,
    live_call: true,
    endpoint_used: "messages.create",
    answer,
    reasoning_content: extractAnthropicReasoningContent(json),
    storedAssistantMessage: answer,
    raw_response_id: json?.id || null,
    usage: json?.usage || null,
    stop_reason: json?.stop_reason || null,
    content_blocks: Array.isArray(json?.content) ? json.content : [],
    safety,
    request_preview: {
      provider: "anthropic",
      endpoint_type: "messages.create",
      model: normalized.model_name,
      prompt_length: String(finalPrompt || "").length,
      max_tokens: payload.max_tokens,
      api_version: liveConfig.api_version,
      tools_enabled: Boolean(payload.tools)
    }
  };
}

async function getAnthropicLiveStatus() {
  const catalog = await getProviderCatalog();
  const profiles = await listNormalizedModelProfiles({ provider: "anthropic", include_inactive: true }).catch(() => []);
  const liveConfig = getAnthropicLiveConfig();
  const activeProfiles = profiles.filter((profile) => profile.is_active);

  return {
    ok: true,
    phase: "11-3",
    provider: "anthropic",
    status: liveConfig.live_call_allowed ? "READY_FOR_LIVE_TEST" : "NOT_READY",
    live_config: liveConfig,
    catalog_item: catalog.find((item) => item.provider === "anthropic") || null,
    profiles: {
      count: profiles.length,
      active_count: activeProfiles.length,
      active_models: activeProfiles.map((profile) => profile.model_name)
    },
    checklist: [
      { key: "ai_live_mode", label: "AI_LIVE_MODE=true", passed: liveConfig.live_mode_enabled },
      { key: "anthropic_live_enabled", label: "ANTHROPIC_LIVE_ENABLED=true", passed: liveConfig.anthropic_live_enabled },
      { key: "anthropic_api_key", label: "ANTHROPIC_API_KEY configured", passed: liveConfig.api_key_configured },
      { key: "anthropic_version", label: "ANTHROPIC_VERSION configured", passed: Boolean(liveConfig.api_version) },
      { key: "prompt_limit", label: "ANTHROPIC_LIVE_MAX_PROMPT_CHARS configured", passed: liveConfig.max_prompt_chars > 0 },
      { key: "timeout", label: "ANTHROPIC_LIVE_TIMEOUT_MS configured", passed: liveConfig.timeout_ms > 0 }
    ],
    recommended_env: {
      AI_LIVE_MODE: "false until live test is needed, then true",
      ANTHROPIC_LIVE_ENABLED: "false until Claude live test is needed, then true",
      ANTHROPIC_API_KEY: "your Anthropic API key",
      ANTHROPIC_VERSION: liveConfig.api_version,
      ANTHROPIC_DEFAULT_MODEL: liveConfig.default_model,
      ANTHROPIC_LIVE_MAX_PROMPT_CHARS: String(liveConfig.max_prompt_chars),
      ANTHROPIC_LIVE_TIMEOUT_MS: String(liveConfig.timeout_ms),
      ANTHROPIC_MAX_OUTPUT_TOKENS: String(liveConfig.max_output_tokens),
      ANTHROPIC_LIVE_ALLOWED_MODELS: liveConfig.allowed_models.join(",") || "optional"
    }
  };
}

async function listAnthropicAvailableModels({ limit = 100 } = {}) {
  const liveConfig = getAnthropicLiveConfig();

  if (!liveConfig.api_key_configured) {
    return {
      ok: false,
      phase: "11-3",
      provider: "anthropic",
      adapter_status: "ANTHROPIC_API_KEY_MISSING",
      error: "ANTHROPIC_API_KEY is not configured.",
      models: []
    };
  }

  try {
    const response = await withTimeout(fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": liveConfig.api_version
      }
    }), liveConfig.timeout_ms);

    const responseText = await response.text();
    let json = null;
    try { json = responseText ? JSON.parse(responseText) : null; } catch (_) { json = { raw_text: responseText }; }

    if (!response.ok) {
      const apiError = new Error(json?.error?.message || json?.message || responseText || `Anthropic models API returned HTTP ${response.status}`);
      apiError.status = response.status;
      apiError.raw = json;
      throw apiError;
    }

    const data = Array.isArray(json?.data) ? json.data : [];
    const models = data
      .map((model) => ({ id: model.id, display_name: model.display_name || model.name || null, created_at: model.created_at || null }))
      .filter((model) => model.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)));

    return {
      ok: true,
      phase: "11-3",
      provider: "anthropic",
      adapter_status: "ANTHROPIC_AVAILABLE_MODELS_LOADED",
      count: models.length,
      live_config: {
        default_model: liveConfig.default_model,
        allowed_models: liveConfig.allowed_models,
        allowed_models_enforced: liveConfig.allowed_models_enforced,
        api_version: liveConfig.api_version
      },
      models
    };
  } catch (error) {
    const normalized = normalizeAnthropicApiError(error);
    return {
      ...normalized,
      adapter_status: "ANTHROPIC_AVAILABLE_MODELS_FAILED",
      models: []
    };
  }
}

async function testAnthropicLiveProvider({ model_name = null, prompt = "Phase 11-3 Anthropic live provider safety test.", live = false, tools = null, messages_override = null } = {}) {
  const liveConfig = getAnthropicLiveConfig();
  const modelProfile = normalizeModelProfile({
    model_code: "anthropic_live_test",
    provider: "anthropic",
    model_name: model_name || liveConfig.default_model,
    display_name: "Anthropic Live Provider Test",
    max_output_tokens: Math.min(liveConfig.max_output_tokens, 500),
    is_active: true
  });

  const safety = assertAnthropicLiveSafety({ modelProfile, finalPrompt: prompt });
  const request_preview = buildProviderRequestPreview({ modelProfile, finalPrompt: prompt });

  if (!live) {
    return {
      ok: true,
      phase: "11-3",
      provider: "anthropic",
      adapter_status: "ANTHROPIC_LIVE_DRY_RUN_READY",
      live_requested: false,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      response: buildMockProviderResponse({ modelProfile, finalPrompt: prompt })
    };
  }

  if (!safety.ok) {
    return {
      ok: false,
      phase: "11-3",
      provider: "anthropic",
      adapter_status: "ANTHROPIC_LIVE_BLOCKED_BY_SAFETY_GATE",
      live_requested: true,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview
    };
  }

  try {
    const response = await callAnthropicLive({ modelProfile, finalPrompt: prompt, tools, messages_override });

    return {
      ok: true,
      phase: "11-3",
      provider: "anthropic",
      adapter_status: "ANTHROPIC_LIVE_CALL_COMPLETED",
      live_requested: true,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      response
    };
  } catch (error) {
    const normalizedError = normalizeAnthropicApiError(error);

    return {
      ...normalizedError,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      raw_error: error.raw || null
    };
  }
}


function assertGeminiLiveSafety({ modelProfile, finalPrompt }) {
  const normalized = normalizeModelProfile(modelProfile);
  const liveConfig = getGeminiLiveConfig();
  const errors = [];
  const warnings = [];

  if (normalized.provider !== "google") {
    errors.push("Live Gemini safety check can only run for provider=google.");
  }

  if (!liveConfig.live_mode_enabled) {
    errors.push("AI_LIVE_MODE is not enabled.");
  }

  if (!liveConfig.gemini_live_enabled) {
    errors.push("GEMINI_LIVE_ENABLED is not enabled.");
  }

  if (!liveConfig.api_key_configured) {
    errors.push("GEMINI_API_KEY or GOOGLE_API_KEY is not configured.");
  }

  if (!String(finalPrompt || "").trim()) {
    errors.push("finalPrompt is empty.");
  }

  if (String(finalPrompt || "").length > liveConfig.max_prompt_chars) {
    errors.push(`Prompt length exceeds GEMINI_LIVE_MAX_PROMPT_CHARS. length=${String(finalPrompt || "").length}, max=${liveConfig.max_prompt_chars}`);
  }

  if (liveConfig.allowed_models_enforced && !liveConfig.allowed_models.includes(normalized.model_name)) {
    errors.push(`Model ${normalized.model_name} is not in GEMINI_LIVE_ALLOWED_MODELS.`);
  }

  if (!liveConfig.allowed_models_enforced) {
    warnings.push("GEMINI_LIVE_ALLOWED_MODELS is not set. Any selected Gemini model can be used when live mode is enabled.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    live_config: liveConfig,
    model_profile: normalized,
    prompt_length: String(finalPrompt || "").length
  };
}

function extractGeminiResponseText(response) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const parts = [];

  for (const candidate of candidates) {
    const blocks = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const block of blocks) {
      if (typeof block?.text === "string") parts.push(block.text);
    }
  }

  return parts.join("\n").trim();
}

function assertLmStudioLiveSafety({ modelProfile, finalPrompt }) {
  const normalized = normalizeModelProfile(modelProfile);
  const liveConfig = getLmStudioLiveConfig();
  const errors = [];
  const warnings = [];

  if (normalized.provider !== "lmstudio") {
    errors.push("Live LM Studio safety check can only run for provider=lmstudio.");
  }

  if (!liveConfig.live_mode_enabled) {
    errors.push("AI_LIVE_MODE is not enabled.");
  }

  if (!liveConfig.lmstudio_live_enabled) {
    errors.push("LMSTUDIO_LIVE_ENABLED is not enabled.");
  }

  if (!liveConfig.base_url_configured) {
    errors.push("LMSTUDIO_BASE_URL is not configured.");
  }

  if (!String(finalPrompt || "").trim()) {
    errors.push("finalPrompt is empty.");
  }

  if (String(finalPrompt || "").length > liveConfig.max_prompt_chars) {
    errors.push(`Prompt length exceeds LMSTUDIO_LIVE_MAX_PROMPT_CHARS. length=${String(finalPrompt || "").length}, max=${liveConfig.max_prompt_chars}`);
  }

  if (liveConfig.allowed_models_enforced && !liveConfig.allowed_models.includes(normalized.model_name)) {
    errors.push(`Model ${normalized.model_name} is not in LMSTUDIO_LIVE_ALLOWED_MODELS.`);
  }

  if (!liveConfig.allowed_models_enforced) {
    warnings.push("LMSTUDIO_LIVE_ALLOWED_MODELS is not set. Any selected local model can be used when live mode is enabled.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    live_config: liveConfig,
    model_profile: normalized,
    prompt_length: String(finalPrompt || "").length
  };
}

function extractLmStudioResponseText(response) {
  if (!response) return "";
  if (typeof response?.choices?.[0]?.message?.content === "string") return response.choices[0].message.content;

  const content = Array.isArray(response?.choices?.[0]?.message?.content) ? response.choices[0].message.content : [];
  const parts = [];

  for (const block of content) {
    if (typeof block?.text === "string") parts.push(block.text);
    if (typeof block?.content === "string") parts.push(block.content);
  }

  return parts.join("\n").trim();
}

// Reasoning-capable local models (e.g. LM Studio's gemma reasoning builds) expose their
// chain-of-thought as message.reasoning_content, separate from the final answer in .content.
function extractLmStudioReasoningContent(response) {
  const reasoning = response?.choices?.[0]?.message?.reasoning_content;
  return typeof reasoning === "string" && reasoning.trim() ? reasoning : null;
}

function normalizeLmStudioApiError(error) {
  const message = error?.message || String(error || "Unknown LM Studio error");
  const status = error?.status || error?.http_status || null;
  const isConnectionError = /fetch|network|ECONNREFUSED|ENOTFOUND|connect|timed out/i.test(message);

  return {
    ok: false,
    phase: "11-6",
    provider: "lmstudio",
    adapter_status: isConnectionError ? "LMSTUDIO_CONNECTION_FAILED" : "LMSTUDIO_LIVE_CALL_FAILED",
    live_requested: true,
    http_status: status,
    error: message,
    diagnosis: isConnectionError
      ? "LM Studio did not answer at the configured local endpoint. Confirm the server is running and LMSTUDIO_BASE_URL points to /v1."
      : "LM Studio live call failed after passing the local safety gate.",
    recommended_action: isConnectionError
      ? [
          "Start LM Studio and make sure the local server is listening on the LMSTUDIO_BASE_URL endpoint.",
          "Verify the server exposes OpenAI-compatible /v1/chat/completions.",
          "Retry with live=false to confirm the local adapter path is still healthy."
        ]
      : [
          "Check LMSTUDIO_BASE_URL and the selected model in .env.",
          "Run LM Studio Live Status again.",
          "Retry with live=false to confirm the local adapter path is still healthy."
        ]
  };
}

const LMSTUDIO_MIN_ANSWER_LENGTH = 20;

async function callLmStudioLive({ modelProfile, finalPrompt, system_context_text = "", max_output_tokens_override = null }) {
  const normalized = normalizeModelProfile(modelProfile);
  const safety = assertLmStudioLiveSafety({ modelProfile: normalized, finalPrompt });

  if (!safety.ok) {
    const error = new Error(`LM Studio live call blocked by safety gate: ${safety.errors.join(" | ")}`);
    error.safety = safety;
    throw error;
  }

  const liveConfig = getLmStudioLiveConfig();
  const requestPreview = buildProviderRequestPreview({ modelProfile: normalized, finalPrompt, system_context_text });
  const endpoint = `${String(liveConfig.endpoint || "http://localhost:1234/v1").replace(/\/$/, "")}/chat/completions`;
  // See callAnthropicLive's outputTokenCap comment - same override mechanism here so the
  // collab critic can be given a different budget than the shared LMSTUDIO_MAX_OUTPUT_TOKENS.
  const outputTokenCap = max_output_tokens_override || liveConfig.max_output_tokens;
  const payload = {
    model: requestPreview.model,
    messages: requestPreview.messages,
    max_tokens: Math.min(normalized.max_output_tokens || outputTokenCap, outputTokenCap)
  };

  if (liveConfig.send_temperature) {
    payload.temperature = normalized.temperature_default;
  }

  const response = await withTimeout(fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  }), liveConfig.timeout_ms);

  const responseText = await response.text();
  let json = null;
  try { json = responseText ? JSON.parse(responseText) : null; } catch (_) { json = { raw_text: responseText }; }

  if (!response.ok) {
    const apiError = new Error(json?.error?.message || json?.message || responseText || `LM Studio API returned HTTP ${response.status}`);
    apiError.status = response.status;
    apiError.raw = json;
    throw apiError;
  }

  const answer = extractLmStudioResponseText(json);

  return {
    provider: normalized.provider,
    model_code: normalized.model_code,
    model_name: normalized.model_name,
    live_call: true,
    endpoint_used: "chat.completions.create",
    answer,
    reasoning_content: extractLmStudioReasoningContent(json),
    storedAssistantMessage: answer,
    raw_response_id: json?.id || null,
    usage: json?.usage || null,
    safety,
    request_preview: {
      provider: "lmstudio",
      endpoint_type: "chat.completions.create",
      model: requestPreview.model,
      prompt_length: String(finalPrompt || "").length,
      max_output_tokens: payload.max_tokens
    }
  };
}

async function getLmStudioLiveStatus() {
  const catalog = await getProviderCatalog();
  const profiles = await listNormalizedModelProfiles({ provider: "lmstudio", include_inactive: true }).catch(() => []);
  const liveConfig = getLmStudioLiveConfig();
  const activeProfiles = profiles.filter((profile) => profile.is_active);

  return {
    ok: true,
    phase: "11-6",
    provider: "lmstudio",
    status: liveConfig.live_call_allowed ? "READY_FOR_LIVE_TEST" : "NOT_READY",
    live_config: liveConfig,
    catalog_item: catalog.find((item) => item.provider === "lmstudio") || null,
    profiles: {
      count: profiles.length,
      active_count: activeProfiles.length,
      active_models: activeProfiles.map((profile) => profile.model_name)
    },
    checklist: [
      { key: "ai_live_mode", label: "AI_LIVE_MODE=true", passed: liveConfig.live_mode_enabled },
      { key: "lmstudio_live_enabled", label: "LMSTUDIO_LIVE_ENABLED=true", passed: liveConfig.lmstudio_live_enabled },
      { key: "lmstudio_base_url", label: "LMSTUDIO_BASE_URL configured", passed: liveConfig.base_url_configured },
      { key: "prompt_limit", label: "LMSTUDIO_LIVE_MAX_PROMPT_CHARS configured", passed: liveConfig.max_prompt_chars > 0 },
      { key: "timeout", label: "LMSTUDIO_LIVE_TIMEOUT_MS configured", passed: liveConfig.timeout_ms > 0 }
    ],
    recommended_env: {
      AI_LIVE_MODE: "false until live test is needed, then true",
      LMSTUDIO_LIVE_ENABLED: "false until LM Studio live test is needed, then true",
      LMSTUDIO_BASE_URL: liveConfig.endpoint,
      LMSTUDIO_MODEL: liveConfig.default_model,
      LMSTUDIO_LIVE_MAX_PROMPT_CHARS: String(liveConfig.max_prompt_chars),
      LMSTUDIO_LIVE_TIMEOUT_MS: String(liveConfig.timeout_ms),
      LMSTUDIO_MAX_OUTPUT_TOKENS: String(liveConfig.max_output_tokens),
      LMSTUDIO_LIVE_ALLOWED_MODELS: liveConfig.allowed_models.join(",") || "optional"
    }
  };
}

async function testLmStudioLiveProvider({ model_name = null, prompt = "Phase 11-6 LM Studio live provider safety test.", live = false } = {}) {
  const liveConfig = getLmStudioLiveConfig();
  const modelProfile = normalizeModelProfile({
    model_code: "lmstudio_live_test",
    provider: "lmstudio",
    model_name: model_name || liveConfig.default_model,
    display_name: "LM Studio Live Provider Test",
    max_output_tokens: Math.min(liveConfig.max_output_tokens, 500),
    is_active: true
  });

  const safety = assertLmStudioLiveSafety({ modelProfile, finalPrompt: prompt });
  const request_preview = buildProviderRequestPreview({ modelProfile, finalPrompt: prompt });

  if (!live) {
    return {
      ok: true,
      phase: "11-6",
      provider: "lmstudio",
      adapter_status: "LMSTUDIO_LIVE_DRY_RUN_READY",
      live_requested: false,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      response: buildMockProviderResponse({ modelProfile, finalPrompt: prompt })
    };
  }

  if (!safety.ok) {
    return {
      ok: false,
      phase: "11-6",
      provider: "lmstudio",
      adapter_status: "LMSTUDIO_LIVE_BLOCKED_BY_SAFETY_GATE",
      live_requested: true,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview
    };
  }

  try {
    let response = await callLmStudioLive({ modelProfile, finalPrompt: prompt });

    // Phase 10 eval turned up cases where LM Studio (a small local model) returns an
    // empty or truncated answer with no error at all - testProviderAdapter/executeProviderAnswer
    // has no way to tell that apart from a real, complete answer. One automatic retry gives
    // the local model a second chance; if it's still empty/too short, this is reported
    // honestly via lmstudio_retry_exhausted rather than passed off as a normal success.
    // Only applies to this executeProviderAnswer path - the two-agent collab loop
    // (runTwoAgentLoop's callTwoAgentRoleProvider) calls callLmStudioLive() directly and
    // never goes through testLmStudioLiveProvider.
    const isTooShort = (text) => !text || String(text).trim().length < LMSTUDIO_MIN_ANSWER_LENGTH;
    let lmstudioRetried = false;
    let lmstudioRetryExhausted = false;

    if (isTooShort(response.answer)) {
      lmstudioRetried = true;
      const retryResponse = await callLmStudioLive({ modelProfile, finalPrompt: prompt });
      if (!isTooShort(retryResponse.answer)) {
        response = retryResponse;
      } else {
        // Retry didn't help either - keep whichever attempt has more content, but be
        // honest that neither attempt actually succeeded.
        response = (retryResponse.answer || "").length > (response.answer || "").length ? retryResponse : response;
        lmstudioRetryExhausted = true;
      }
    }

    return {
      ok: true,
      phase: "11-6",
      provider: "lmstudio",
      adapter_status: "LMSTUDIO_LIVE_CALL_COMPLETED",
      live_requested: true,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      response,
      lmstudio_retried: lmstudioRetried,
      lmstudio_retry_exhausted: lmstudioRetryExhausted
    };
  } catch (error) {
    const normalizedError = normalizeLmStudioApiError(error);

    return {
      ...normalizedError,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      raw_error: error.raw || null
    };
  }
}

function normalizeGeminiApiError(error) {
  const message = error?.message || String(error || "Unknown Gemini error");
  const status = error?.status || error?.http_status || null;
  const isModelNotFound = /model.*not.*found|not found|invalid.*model|does not exist/i.test(message);
  const isAuthError = /api key|unauthorized|permission|forbidden|authentication/i.test(message);

  return {
    ok: false,
    phase: "11-4",
    provider: "google",
    adapter_status: isModelNotFound ? "GEMINI_MODEL_NOT_AVAILABLE" : isAuthError ? "GEMINI_AUTH_FAILED" : "GEMINI_LIVE_CALL_FAILED",
    live_requested: true,
    http_status: status,
    error: message,
    diagnosis: isModelNotFound
      ? "The Gemini API call reached Google successfully, but the requested Gemini model id is not available to this API key or the model id is invalid."
      : isAuthError
        ? "Google rejected the request because the API key or account permission is invalid."
        : "Gemini live call failed after passing the local safety gate.",
    recommended_action: isModelNotFound
      ? [
          "Use a Gemini model id that is enabled for your Google AI Studio project.",
          "Call GET /ai/model/gemini/available-models to see models visible to this API key.",
          "Set GEMINI_DEFAULT_MODEL and GEMINI_LIVE_ALLOWED_MODELS to the exact model id you will use."
        ]
      : [
          "Check GEMINI_API_KEY or GOOGLE_API_KEY in .env.",
          "Run Gemini Live Status again.",
          "Retry with live=false to confirm the local adapter path is still healthy."
        ]
  };
}

async function callGeminiLive({ modelProfile, finalPrompt, system_context_text = "" }) {
  const normalized = normalizeModelProfile(modelProfile);
  const safety = assertGeminiLiveSafety({ modelProfile: normalized, finalPrompt });

  if (!safety.ok) {
    const error = new Error(`Gemini live call blocked by safety gate: ${safety.errors.join(" | ")}`);
    error.safety = safety;
    throw error;
  }

  const liveConfig = getGeminiLiveConfig();
  const requestPreview = buildProviderRequestPreview({ modelProfile: normalized, finalPrompt, system_context_text });
  const apiKey = getGeminiApiKey();
  const modelName = String(normalized.model_name || liveConfig.default_model).replace(/^models\//, "");
  const endpoint = `${liveConfig.endpoint_base}/${liveConfig.api_version}/models/${encodeURIComponent(modelName)}:generateContent`;

  const payload = {
    contents: requestPreview.contents,
    generationConfig: {
      maxOutputTokens: Math.min(normalized.max_output_tokens || liveConfig.max_output_tokens, liveConfig.max_output_tokens)
    }
  };

  const response = await withTimeout(fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(payload)
  }), liveConfig.timeout_ms);

  const responseText = await response.text();
  let json = null;
  try { json = responseText ? JSON.parse(responseText) : null; } catch (_) { json = { raw_text: responseText }; }

  if (!response.ok) {
    const apiError = new Error(json?.error?.message || json?.message || responseText || `Gemini API returned HTTP ${response.status}`);
    apiError.status = response.status;
    apiError.raw = json;
    throw apiError;
  }

  const answer = extractGeminiResponseText(json);

  return {
    provider: normalized.provider,
    model_code: normalized.model_code,
    model_name: normalized.model_name,
    live_call: true,
    endpoint_used: "models.generateContent",
    answer,
    storedAssistantMessage: answer,
    raw_response_id: json?.responseId || null,
    usage: json?.usageMetadata || null,
    safety,
    request_preview: {
      provider: "google",
      endpoint_type: "models.generateContent",
      model: normalized.model_name,
      prompt_length: String(finalPrompt || "").length,
      max_output_tokens: payload.generationConfig.maxOutputTokens,
      api_version: liveConfig.api_version
    }
  };
}

async function getGeminiLiveStatus() {
  const catalog = await getProviderCatalog();
  const profiles = await listNormalizedModelProfiles({ provider: "google", include_inactive: true }).catch(() => []);
  const liveConfig = getGeminiLiveConfig();
  const activeProfiles = profiles.filter((profile) => profile.is_active);

  return {
    ok: true,
    phase: "11-4",
    provider: "google",
    status: liveConfig.live_call_allowed ? "READY_FOR_LIVE_TEST" : "NOT_READY",
    live_config: liveConfig,
    catalog_item: catalog.find((item) => item.provider === "google") || null,
    profiles: {
      count: profiles.length,
      active_count: activeProfiles.length,
      active_models: activeProfiles.map((profile) => profile.model_name)
    },
    checklist: [
      { key: "ai_live_mode", label: "AI_LIVE_MODE=true", passed: liveConfig.live_mode_enabled },
      { key: "gemini_live_enabled", label: "GEMINI_LIVE_ENABLED=true", passed: liveConfig.gemini_live_enabled },
      { key: "gemini_api_key", label: "GEMINI_API_KEY or GOOGLE_API_KEY configured", passed: liveConfig.api_key_configured },
      { key: "prompt_limit", label: "GEMINI_LIVE_MAX_PROMPT_CHARS configured", passed: liveConfig.max_prompt_chars > 0 },
      { key: "timeout", label: "GEMINI_LIVE_TIMEOUT_MS configured", passed: liveConfig.timeout_ms > 0 }
    ],
    recommended_env: {
      AI_LIVE_MODE: "false until live test is needed, then true",
      GEMINI_LIVE_ENABLED: "false until Gemini live test is needed, then true",
      GEMINI_API_KEY: "your Google AI Studio Gemini API key",
      GEMINI_DEFAULT_MODEL: liveConfig.default_model,
      GEMINI_LIVE_MAX_PROMPT_CHARS: String(liveConfig.max_prompt_chars),
      GEMINI_LIVE_TIMEOUT_MS: String(liveConfig.timeout_ms),
      GEMINI_MAX_OUTPUT_TOKENS: String(liveConfig.max_output_tokens),
      GEMINI_LIVE_ALLOWED_MODELS: liveConfig.allowed_models.join(",") || "optional"
    }
  };
}

async function listGeminiAvailableModels({ limit = 100 } = {}) {
  const liveConfig = getGeminiLiveConfig();
  const apiKey = getGeminiApiKey();

  if (!liveConfig.api_key_configured) {
    return {
      ok: false,
      phase: "11-4",
      provider: "google",
      adapter_status: "GEMINI_API_KEY_MISSING",
      error: "GEMINI_API_KEY or GOOGLE_API_KEY is not configured.",
      models: []
    };
  }

  try {
    const endpoint = `${liveConfig.endpoint_base}/${liveConfig.api_version}/models`;
    const response = await withTimeout(fetch(endpoint, {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey
      }
    }), liveConfig.timeout_ms);

    const responseText = await response.text();
    let json = null;
    try { json = responseText ? JSON.parse(responseText) : null; } catch (_) { json = { raw_text: responseText }; }

    if (!response.ok) {
      const apiError = new Error(json?.error?.message || json?.message || responseText || `Gemini models API returned HTTP ${response.status}`);
      apiError.status = response.status;
      apiError.raw = json;
      throw apiError;
    }

    const data = Array.isArray(json?.models) ? json.models : [];
    const models = data
      .map((model) => ({
        id: String(model.name || "").replace(/^models\//, ""),
        name: model.name || null,
        display_name: model.displayName || null,
        description: model.description || null,
        supported_generation_methods: model.supportedGenerationMethods || []
      }))
      .filter((model) => model.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)));

    return {
      ok: true,
      phase: "11-4",
      provider: "google",
      adapter_status: "GEMINI_AVAILABLE_MODELS_LOADED",
      count: models.length,
      live_config: {
        default_model: liveConfig.default_model,
        allowed_models: liveConfig.allowed_models,
        allowed_models_enforced: liveConfig.allowed_models_enforced,
        api_version: liveConfig.api_version
      },
      models
    };
  } catch (error) {
    const normalized = normalizeGeminiApiError(error);
    return {
      ...normalized,
      adapter_status: "GEMINI_AVAILABLE_MODELS_FAILED",
      models: []
    };
  }
}

async function testGeminiLiveProvider({ model_name = null, prompt = "Phase 11-4 Gemini live provider safety test.", live = false } = {}) {
  const liveConfig = getGeminiLiveConfig();
  const modelProfile = normalizeModelProfile({
    model_code: "gemini_live_test",
    provider: "google",
    model_name: model_name || liveConfig.default_model,
    display_name: "Gemini Live Provider Test",
    max_output_tokens: Math.min(liveConfig.max_output_tokens, 500),
    is_active: true
  });

  const safety = assertGeminiLiveSafety({ modelProfile, finalPrompt: prompt });
  const request_preview = buildProviderRequestPreview({ modelProfile, finalPrompt: prompt });

  if (!live) {
    return {
      ok: true,
      phase: "11-4",
      provider: "google",
      adapter_status: "GEMINI_LIVE_DRY_RUN_READY",
      live_requested: false,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      response: buildMockProviderResponse({ modelProfile, finalPrompt: prompt })
    };
  }

  if (!safety.ok) {
    return {
      ok: false,
      phase: "11-4",
      provider: "google",
      adapter_status: "GEMINI_LIVE_BLOCKED_BY_SAFETY_GATE",
      live_requested: true,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview
    };
  }

  try {
    const response = await callGeminiLive({ modelProfile, finalPrompt: prompt });

    return {
      ok: true,
      phase: "11-4",
      provider: "google",
      adapter_status: "GEMINI_LIVE_CALL_COMPLETED",
      live_requested: true,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      response
    };
  } catch (error) {
    const normalizedError = normalizeGeminiApiError(error);

    return {
      ...normalizedError,
      live_mode_enabled: liveConfig.live_mode_enabled,
      safety,
      model_profile: modelProfile,
      request_preview,
      raw_error: error.raw || null
    };
  }
}

async function testProviderAdapter({ provider = "mock", model_name = null, prompt = "Hello", live = false, tools = null, messages_override = null } = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const catalogItem = PROVIDER_CATALOG.find((item) => item.provider === normalizedProvider) || PROVIDER_CATALOG.find((item) => item.provider === "mock");

  if (normalizedProvider === "openai") {
    return testOpenAiLiveProvider({ model_name: model_name || catalogItem.default_model, prompt, live });
  }

  if (normalizedProvider === "anthropic") {
    return testAnthropicLiveProvider({ model_name: model_name || catalogItem.default_model, prompt, live, tools, messages_override });
  }

  if (normalizedProvider === "google") {
    return testGeminiLiveProvider({ model_name: model_name || catalogItem.default_model, prompt, live });
  }

  if (normalizedProvider === "lmstudio") {
    return testLmStudioLiveProvider({ model_name: model_name || catalogItem.default_model, prompt, live });
  }

  const modelProfile = normalizeModelProfile({
    model_code: `${normalizedProvider}_adapter_test`,
    provider: normalizedProvider,
    model_name: model_name || catalogItem.default_model,
    display_name: `${catalogItem.provider_name} Adapter Test`,
    is_active: true
  });

  const request_preview = buildProviderRequestPreview({
    modelProfile,
    finalPrompt: prompt
  });

  const response = await callProviderModel({
    modelProfile,
    finalPrompt: prompt,
    live
  });

  return {
    ok: true,
    phase: "11-1",
    provider: normalizedProvider,
    adapter_status: response.live_call ? "LIVE_CALL_COMPLETED" : "MOCK_CALL_COMPLETED",
    live_requested: Boolean(live),
    live_mode_enabled: isTruthy(process.env.AI_LIVE_MODE),
    model_profile: modelProfile,
    request_preview,
    response
  };
}

module.exports = {
  normalizeProvider,
  normalizeModelProfile,
  getProviderCatalog,
  getModelProfileColumns,
  listNormalizedModelProfiles,
  buildProviderMessages,
  buildProviderRequestPreview,
  callProviderModel,
  testProviderAdapter,
  getLiveModeConfig,
  getOpenAiLiveStatus,
  assertOpenAiLiveSafety,
  testOpenAiLiveProvider,
  listOpenAiAvailableModels,
  normalizeOpenAiApiError,
  getAnthropicLiveConfig,
  getAnthropicLiveStatus,
  assertAnthropicLiveSafety,
  testAnthropicLiveProvider,
  listAnthropicAvailableModels,
  normalizeAnthropicApiError,
  callAnthropicLive,
  getGeminiLiveConfig,
  getGeminiLiveStatus,
  assertGeminiLiveSafety,
  testGeminiLiveProvider,
  listGeminiAvailableModels,
  normalizeGeminiApiError,
  callGeminiLive,
  getLmStudioLiveConfig,
  getLmStudioLiveStatus,
  assertLmStudioLiveSafety,
  testLmStudioLiveProvider,
  normalizeLmStudioApiError,
  callLmStudioLive
};
