const pool = require("../config/db");

function nowIso() {
  return new Date().toISOString();
}

const DEFAULT_PROJECTS = [
  { project_code: "auto", label: "Auto Detect" },
  { project_code: "ai_memory_gateway", label: "AI Memory Gateway" },
  { project_code: "rbs_homes", label: "RBS Homes" },
  { project_code: "runquest_ph", label: "RunQuest PH" },
  { project_code: "philippines_franchise", label: "Philippines Franchise" },
  { project_code: "bgc_office_acquisition", label: "BGC Office Acquisition" },
  { project_code: "rbs_ai_memory", label: "RBS AI Memory / Import Test" }
];

const PROVIDERS = [
  { provider: "auto", label: "Auto" },
  { provider: "mock", label: "Mock" },
  { provider: "openai", label: "OpenAI" },
  { provider: "anthropic", label: "Claude" },
  { provider: "gemini", label: "Gemini" }
];

const DEFAULT_PROJECT_RULES = [
  {
    project_code: "ai_memory_gateway",
    label: "AI Memory Gateway",
    priority: 100,
    keywords: [
      "ai memory", "memory gateway", "gateway agent", "personal agent", "phase 17", "phase17",
      "phase 16", "phase16", "github", "mini pc", "미니pc", "미니 pc", "nas", "tailscale",
      "importer", "summary queue", "agent", "개인 서버", "메모리 서버", "질문 전용"
    ]
  },
  {
    project_code: "rbs_homes",
    label: "RBS Homes / Real Estate Platform",
    priority: 90,
    keywords: [
      "rbs", "rbs-homes", "rbs homes", "admin-rbs", "부동산", "매물", "listing", "broker", "tenant", "owner",
      "kakao", "카카오", "telegram", "텔레그램", "viber", "바이버", "appsheet", "crm", "condo", "office listing"
    ]
  },
  {
    project_code: "runquest_ph",
    label: "RunQuest PH",
    priority: 80,
    keywords: [
      "runquest", "runquest ph", "jogging", "running", "runner", "pwa", "xp", "course", "bgc running",
      "ayala triangle", "moa", "조깅", "러닝", "코스", "캐릭터", "level", "unlock"
    ]
  },
  {
    project_code: "philippines_franchise",
    label: "Philippines Franchise",
    priority: 70,
    keywords: [
      "franchise", "프랜차이즈", "커피", "coffee", "떡볶이", "tteokbokki", "타코야키", "takoyaki",
      "분식", "peza", "ayala", "sm mall", "mall", "로드매장", "공장"
    ]
  },
  {
    project_code: "bgc_office_acquisition",
    label: "BGC Office Acquisition",
    priority: 60,
    keywords: [
      "bgc office", "office acquisition", "buildingco", "landco", "cap rate", "noi", "ltv", "zonal", "office building",
      "오피스 인수", "빌딩", "임대율", "exit", "occupancy"
    ]
  }
];

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?`,
    [tableName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function getColumns(tableName) {
  const exists = await tableExists(tableName);
  if (!exists) return [];
  const [rows] = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?`,
    [tableName]
  );
  return (rows || []).map((row) => row.column_name);
}

async function ensureColumn(tableName, columnName, definition) {
  const columns = await getColumns(tableName);
  if (!columns.includes(columnName)) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function countRows(tableName) {
  if (!(await tableExists(tableName))) return 0;
  const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(rows[0]?.count || 0);
}

async function ensurePersonalAgentTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personal_agent_interactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_code VARCHAR(100) NULL,
      detected_project_code VARCHAR(100) NULL,
      provider_requested VARCHAR(50) NULL,
      provider_used VARCHAR(50) NULL,
      user_question MEDIUMTEXT NOT NULL,
      context_summary MEDIUMTEXT NULL,
      answer MEDIUMTEXT NULL,
      used_memory_count INT NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      error_message TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_personal_agent_project (project_code),
      INDEX idx_personal_agent_detected_project (detected_project_code),
      INDEX idx_personal_agent_provider (provider_used),
      INDEX idx_personal_agent_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumn("personal_agent_interactions", "detection_confidence", "DECIMAL(5,2) NULL");
  await ensureColumn("personal_agent_interactions", "detection_reason", "TEXT NULL");
  await ensureColumn("personal_agent_interactions", "matched_keywords", "TEXT NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS personal_agent_project_rules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_code VARCHAR(100) NOT NULL,
      label VARCHAR(255) NULL,
      keywords MEDIUMTEXT NOT NULL,
      priority INT NOT NULL DEFAULT 50,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_personal_agent_project_rules_code (project_code),
      INDEX idx_personal_agent_project_rules_active (is_active),
      INDEX idx_personal_agent_project_rules_priority (priority)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const rule of DEFAULT_PROJECT_RULES) {
    await pool.query(
      `INSERT INTO personal_agent_project_rules (project_code, label, keywords, priority, is_active)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         label = VALUES(label),
         keywords = VALUES(keywords),
         priority = VALUES(priority),
         is_active = 1`,
      [rule.project_code, rule.label, JSON.stringify(rule.keywords), rule.priority]
    );
  }
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseKeywords(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch (_) {}
  return raw.split(/[\n,|]+/).map((item) => item.trim()).filter(Boolean);
}

async function getProjectRules() {
  await ensurePersonalAgentTables();
  const [rows] = await pool.query(
    `SELECT project_code, label, keywords, priority, is_active
       FROM personal_agent_project_rules
      WHERE is_active = 1
      ORDER BY priority DESC, project_code ASC`
  );
  return (rows || []).map((row) => ({
    project_code: row.project_code,
    label: row.label || row.project_code,
    priority: Number(row.priority || 0),
    keywords: parseKeywords(row.keywords)
  }));
}

function scoreRule({ text, rule }) {
  const normalizedText = normalizeText(text);
  const matchedKeywords = [];
  let score = 0;

  for (const keyword of rule.keywords || []) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) continue;
    if (normalizedText.includes(normalizedKeyword)) {
      matchedKeywords.push(keyword);
      score += normalizedKeyword.length >= 10 ? 15 : normalizedKeyword.length >= 5 ? 10 : 6;
    }
  }

  if (normalizeText(rule.project_code).split(" ").some((part) => part && normalizedText.includes(part))) {
    score += 3;
  }

  if (matchedKeywords.length > 1) score += Math.min(20, matchedKeywords.length * 4);
  score += Math.min(10, Math.max(0, Number(rule.priority || 0) / 20));

  return {
    project_code: rule.project_code,
    label: rule.label || rule.project_code,
    score: Number(score.toFixed(2)),
    matched_keywords: matchedKeywords,
    priority: rule.priority
  };
}

async function detectProjectCodeAdvanced(question = "", requestedProjectCode = "auto") {
  await ensurePersonalAgentTables();

  if (requestedProjectCode && requestedProjectCode !== "auto") {
    return {
      detected_project_code: requestedProjectCode,
      confidence: 1,
      detection_mode: "manual",
      detection_reason: `Manual project_code selected: ${requestedProjectCode}`,
      matched_keywords: [],
      candidates: [{ project_code: requestedProjectCode, score: 100, matched_keywords: [], manual: true }]
    };
  }

  const text = String(question || "").trim();
  const rules = await getProjectRules();
  const candidates = rules
    .map((rule) => scoreRule({ text, rule }))
    .filter((item) => item.score > 0 || item.matched_keywords.length > 0)
    .sort((a, b) => b.score - a.score || b.priority - a.priority)
    .slice(0, 5);

  const best = candidates[0];
  if (!best || best.score < 8) {
    return {
      detected_project_code: "ai_memory_gateway",
      confidence: 0.35,
      detection_mode: "fallback",
      detection_reason: "No strong project keyword was found. Fallback project_code is ai_memory_gateway.",
      matched_keywords: [],
      candidates
    };
  }

  const second = candidates[1];
  const margin = second ? Math.max(0, best.score - second.score) : best.score;
  const confidence = Math.min(0.98, Math.max(0.5, (best.score + margin) / 80));

  return {
    detected_project_code: best.project_code,
    confidence: Number(confidence.toFixed(2)),
    detection_mode: "auto",
    detection_reason: `Matched ${best.matched_keywords.length} keyword(s): ${best.matched_keywords.slice(0, 6).join(", ") || "project rule score"}`,
    matched_keywords: best.matched_keywords,
    candidates
  };
}

function resolveProvider(provider = "mock") {
  if (!provider || provider === "auto") return "mock";
  return provider;
}

function excerpt(value, max = 280) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function pickExisting(columns, candidates) {
  return candidates.filter((column) => columns.includes(column));
}

async function searchImportedConversationContext({ projectCode, keyword, limit = 5 }) {
  const table = "raw_imported_conversations";
  const columns = await getColumns(table);
  if (!columns.length) return [];

  const selectColumns = pickExisting(columns, ["id", "source_platform", "project_code", "title", "normalized_text", "summary", "import_status", "review_status", "summary_queue_id", "memory_id", "imported_at", "created_at"]);
  const textColumns = pickExisting(columns, ["title", "normalized_text", "summary", "raw_text"]);
  const where = [];
  const params = [];

  if (columns.includes("project_code") && projectCode && projectCode !== "all") {
    where.push("project_code = ?");
    params.push(projectCode);
  }

  if (keyword && textColumns.length) {
    where.push(`(${textColumns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    textColumns.forEach(() => params.push(`%${keyword}%`));
  }

  const orderColumn = columns.includes("id") ? "id" : selectColumns[0];
  const sql = `SELECT ${selectColumns.join(", ")} FROM ${table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orderColumn} DESC LIMIT ?`;
  params.push(Number(limit || 5));

  const [rows] = await pool.query(sql, params);
  return (rows || []).map((row) => ({
    source: "imported_conversation",
    id: row.id,
    source_platform: row.source_platform || null,
    project_code: row.project_code || projectCode,
    title: row.title || "Imported conversation",
    excerpt: excerpt(row.normalized_text || row.summary || row.title || ""),
    summary_queue_id: row.summary_queue_id || null,
    memory_id: row.memory_id || null,
    status: row.review_status || row.import_status || null
  }));
}

async function searchAiMemoryContext({ projectCode, keyword, limit = 5 }) {
  const table = "ai_memory";
  const columns = await getColumns(table);
  if (!columns.length) return [];

  const selectColumns = pickExisting(columns, ["id", "project_code", "memory_type", "title", "summary", "content", "memory_text", "source", "created_at", "updated_at"]);
  if (!selectColumns.length) return [];

  const textColumns = pickExisting(columns, ["title", "summary", "content", "memory_text"]);
  const where = [];
  const params = [];

  if (columns.includes("project_code") && projectCode && projectCode !== "all") {
    where.push("project_code = ?");
    params.push(projectCode);
  }

  if (keyword && textColumns.length) {
    where.push(`(${textColumns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    textColumns.forEach(() => params.push(`%${keyword}%`));
  }

  const orderColumn = columns.includes("updated_at") ? "updated_at" : columns.includes("created_at") ? "created_at" : columns.includes("id") ? "id" : selectColumns[0];
  const sql = `SELECT ${selectColumns.join(", ")} FROM ${table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orderColumn} DESC LIMIT ?`;
  params.push(Number(limit || 5));

  const [rows] = await pool.query(sql, params);
  return (rows || []).map((row) => ({
    source: "ai_memory",
    id: row.id,
    project_code: row.project_code || projectCode,
    title: row.title || row.memory_type || "AI memory",
    excerpt: excerpt(row.summary || row.content || row.memory_text || row.title || ""),
    memory_type: row.memory_type || null,
    status: "memory"
  }));
}

async function getAgentProjects() {
  await ensurePersonalAgentTables();
  const discovered = [];

  for (const tableName of ["raw_imported_conversations", "ai_memory", "personal_agent_interactions", "personal_agent_project_rules"]) {
    const columns = await getColumns(tableName);
    if (!columns.includes("project_code")) continue;
    const [rows] = await pool.query(
      `SELECT DISTINCT project_code FROM ${tableName} WHERE project_code IS NOT NULL AND project_code <> '' LIMIT 50`
    );
    (rows || []).forEach((row) => {
      if (row.project_code && !discovered.some((item) => item.project_code === row.project_code)) {
        discovered.push({ project_code: row.project_code, label: row.project_code });
      }
    });
  }

  const rules = await getProjectRules();
  const merged = [...DEFAULT_PROJECTS];
  rules.forEach((item) => {
    if (!merged.some((existing) => existing.project_code === item.project_code)) merged.push({ project_code: item.project_code, label: item.label || item.project_code });
  });
  discovered.forEach((item) => {
    if (!merged.some((existing) => existing.project_code === item.project_code)) merged.push(item);
  });

  return {
    ok: true,
    phase: "17-2",
    checked_at: nowIso(),
    projects: merged,
    providers: PROVIDERS,
    project_rules: rules.map((rule) => ({ project_code: rule.project_code, label: rule.label, priority: rule.priority, keyword_count: rule.keywords.length })),
    default_project_code: "auto",
    default_provider: "mock"
  };
}

async function getAgentStatus() {
  await ensurePersonalAgentTables();
  const tables = {
    personal_agent_interactions: await tableExists("personal_agent_interactions"),
    personal_agent_project_rules: await tableExists("personal_agent_project_rules"),
    raw_imported_conversations: await tableExists("raw_imported_conversations"),
    ai_memory: await tableExists("ai_memory"),
    ai_conversation_logs: await tableExists("ai_conversation_logs")
  };

  const counts = {
    agent_interactions: await countRows("personal_agent_interactions"),
    project_rules: await countRows("personal_agent_project_rules"),
    imported_conversations: await countRows("raw_imported_conversations"),
    ai_memory: await countRows("ai_memory")
  };

  const checklist = [
    { key: "agent_ui_ready", group: "ui", label: "Personal AI Agent UI is available in Admin Console.", required: true, status: "PASS" },
    { key: "agent_log_table_ready", group: "storage", label: "personal_agent_interactions table exists.", required: true, status: tables.personal_agent_interactions ? "PASS" : "FAIL" },
    { key: "project_rules_ready", group: "detection", label: "personal_agent_project_rules table exists and project rules are seeded.", required: true, status: tables.personal_agent_project_rules && counts.project_rules > 0 ? "PASS" : "FAIL" },
    { key: "imported_memory_available", group: "memory", label: "Imported conversation storage is available for context lookup.", required: false, status: tables.raw_imported_conversations ? "PASS" : "MANUAL_CHECK" },
    { key: "long_term_memory_available", group: "memory", label: "ai_memory table is available for context lookup.", required: false, status: tables.ai_memory ? "PASS" : "MANUAL_CHECK" },
    { key: "mock_provider_ready", group: "provider", label: "Mock provider is ready for safe UI test.", required: true, status: "PASS" }
  ];

  const blockingItems = checklist.filter((item) => item.required && item.status === "FAIL").map((item) => item.key);

  return {
    ok: blockingItems.length === 0,
    phase: "17-2",
    checked_at: nowIso(),
    agent_status: blockingItems.length === 0 ? "READY" : "NOT_READY",
    phase17_3_entry_allowed: blockingItems.length === 0,
    tables,
    counts,
    checklist,
    blocking_items: blockingItems,
    next_actions: [
      "Use project_code=auto and test multiple natural-language questions.",
      "Review detection candidates and confidence before trusting auto routing.",
      "Phase 17-3 will connect deeper memory context assembly."
    ]
  };
}

function buildMockAnswer({ question, detection, providerUsed, contextItems }) {
  const detectedProjectCode = detection.detected_project_code;
  const contextLines = (contextItems || []).slice(0, 5).map((item, index) => {
    const title = item.title || `${item.source} #${item.id}`;
    const detail = item.excerpt ? ` - ${item.excerpt}` : "";
    return `${index + 1}. ${title}${detail}`;
  });

  return [
    `Phase 17-2 mock agent response입니다.`,
    `자동 감지된 project_code는 ${detectedProjectCode} 입니다.`,
    `감지 신뢰도는 ${Math.round((detection.confidence || 0) * 100)}% 입니다.`,
    `감지 근거: ${detection.detection_reason || "-"}`,
    `사용 provider는 ${providerUsed} 입니다.`,
    contextItems.length
      ? `관련 memory/context ${contextItems.length}개를 찾았습니다:\n${contextLines.join("\n")}`
      : `아직 연결 가능한 memory context가 없거나 검색 결과가 없습니다.`,
    `다음 단계에서는 Phase 17-3에서 감지된 project_code를 기준으로 context assembly를 더 깊게 연결하면 됩니다.`,
    `사용자 질문: ${question}`
  ].join("\n\n");
}

async function askPersonalAgent(input = {}) {
  await ensurePersonalAgentTables();

  const question = String(input.question || input.user_question || "").trim();
  if (!question) {
    return {
      ok: false,
      phase: "17-2",
      error: {
        code: "QUESTION_REQUIRED",
        message: "question is required."
      }
    };
  }

  const requestedProjectCode = input.project_code || "auto";
  const detection = await detectProjectCodeAdvanced(question, requestedProjectCode);
  const detectedProjectCode = detection.detected_project_code;
  const providerRequested = input.provider || "mock";
  const providerUsed = resolveProvider(providerRequested);
  const contextLimit = Number(input.context_limit || 5);

  const importedContext = await searchImportedConversationContext({ projectCode: detectedProjectCode, keyword: "", limit: contextLimit });
  const memoryContext = await searchAiMemoryContext({ projectCode: detectedProjectCode, keyword: "", limit: contextLimit });
  const contextItems = [...memoryContext, ...importedContext].slice(0, contextLimit);
  const contextSummary = contextItems.map((item, index) => `${index + 1}. [${item.source}] ${item.title}: ${item.excerpt}`).join("\n");

  const answer = buildMockAnswer({ question, detection, providerUsed, contextItems });

  const [result] = await pool.query(
    `INSERT INTO personal_agent_interactions
       (project_code, detected_project_code, provider_requested, provider_used, user_question, context_summary, answer, used_memory_count, status, detection_confidence, detection_reason, matched_keywords)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
    [
      requestedProjectCode,
      detectedProjectCode,
      providerRequested,
      providerUsed,
      question,
      contextSummary,
      answer,
      contextItems.length,
      detection.confidence,
      detection.detection_reason,
      JSON.stringify(detection.matched_keywords || [])
    ]
  );

  return {
    ok: true,
    phase: "17-2",
    asked_at: nowIso(),
    interaction_id: result.insertId,
    project_code: requestedProjectCode,
    detected_project_code: detectedProjectCode,
    detection,
    detection_confidence: detection.confidence,
    detection_reason: detection.detection_reason,
    matched_keywords: detection.matched_keywords,
    detection_candidates: detection.candidates,
    provider_requested: providerRequested,
    provider_used: providerUsed,
    used_memory_count: contextItems.length,
    context_preview: contextItems,
    answer,
    saved: true,
    saved_table: "personal_agent_interactions",
    next_phase: "Phase 17-3: Memory Context Auto Search / Context Assembly"
  };
}

async function detectProject(input = {}) {
  const question = String(input.question || input.user_question || "").trim();
  const requestedProjectCode = input.project_code || "auto";
  if (!question) {
    return { ok: false, phase: "17-2", error: { code: "QUESTION_REQUIRED", message: "question is required." } };
  }
  const detection = await detectProjectCodeAdvanced(question, requestedProjectCode);
  return {
    ok: true,
    phase: "17-2",
    detected_at: nowIso(),
    question,
    requested_project_code: requestedProjectCode,
    ...detection
  };
}

async function getProjectDetectionStatus() {
  await ensurePersonalAgentTables();
  const rules = await getProjectRules();
  return {
    ok: true,
    phase: "17-2",
    checked_at: nowIso(),
    detection_status: rules.length > 0 ? "READY" : "NOT_READY",
    phase17_3_entry_allowed: rules.length > 0,
    rule_count: rules.length,
    rules: rules.map((rule) => ({
      project_code: rule.project_code,
      label: rule.label,
      priority: rule.priority,
      keyword_count: rule.keywords.length,
      sample_keywords: rule.keywords.slice(0, 8)
    }))
  };
}

async function runProjectDetectionTest(input = {}) {
  const examples = input.examples || [
    "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요.",
    "rbs-homes 카카오톡 매물 검색 기능 이어서 진행하겠습니다.",
    "RunQuest PH PWA 다음 phase를 진행하겠습니다.",
    "필리핀 프랜차이즈 사업 일정표를 이어서 정리해주세요.",
    "BGC office acquisition NOI와 cap rate를 다시 검토해주세요."
  ];

  const results = [];
  for (const question of examples) {
    const detection = await detectProjectCodeAdvanced(question, "auto");
    results.push({ question, ...detection });
  }

  const pass = results.every((item) => item.detected_project_code && item.confidence >= 0.35);
  return {
    ok: pass,
    phase: "17-2",
    test_status: pass ? "PASS" : "FAIL",
    phase17_3_entry_allowed: pass,
    tested_count: results.length,
    results
  };
}

async function runAgentTest(input = {}) {
  const response = await askPersonalAgent({
    question: input.question || "AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요.",
    project_code: input.project_code || "auto",
    provider: input.provider || "mock",
    context_limit: input.context_limit || 5
  });

  return {
    ok: response.ok,
    phase: "17-2",
    test_status: response.ok ? "PASS" : "FAIL",
    phase17_3_entry_allowed: response.ok === true,
    result: response
  };
}

module.exports = {
  ensurePersonalAgentTables,
  getAgentStatus,
  getAgentProjects,
  askPersonalAgent,
  runAgentTest,
  detectProject,
  getProjectDetectionStatus,
  runProjectDetectionTest,
  getProjectRules
};
