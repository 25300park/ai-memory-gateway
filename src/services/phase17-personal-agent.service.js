'use strict';

/**
 * Phase 17 Personal Agent Service
 * Phase 17-4: Provider Router / Real AI Response Connection
 *
 * This version keeps the Phase 17-3 memory-context flow and adds a provider
 * execution layer. In safe mode it uses provider-router dry-run/mock output;
 * when AI_AGENT_LIVE_MODE=true or payload.live=true and provider safety gates
 * allow it, the underlying provider adapter may execute a live call.
 */

let providerRouter = null;
let modelProvider = null;

try {
  providerRouter = require('./provider-router.service');
} catch (error) {
  providerRouter = null;
}

try {
  modelProvider = require('./model-provider.service');
} catch (error) {
  modelProvider = null;
}

const DEFAULT_PROJECTS = [
  { project_code: 'ai_memory_gateway', label: 'AI Memory Gateway', keywords: ['ai memory', 'memory gateway', 'phase 17', 'mini pc', 'github', 'importer'] },
  { project_code: 'rbs_homes', label: 'RBS Homes', keywords: ['rbs', 'rbs-homes', 'real estate', 'kakao', 'property', 'listing', '매물', '부동산'] },
  { project_code: 'runquest_ph', label: 'RunQuest PH', keywords: ['runquest', 'running', 'jogging', 'pwa', 'course', 'xp'] },
  { project_code: 'philippines_franchise', label: 'Philippines Franchise', keywords: ['franchise', '프랜차이즈', 'coffee', 'ayala', 'sm mall', 'peza'] },
  { project_code: 'bgc_office_acquisition', label: 'BGC Office Acquisition', keywords: ['bgc office', 'building', 'acquisition', 'cap rate', 'office'] }
];

function safeJson(value) {
  try { return JSON.stringify(value || null); } catch (_) { return null; }
}

function nowIso() { return new Date().toISOString(); }

function isTruthy(value) {
  return value === true || value === 'true' || value === '1' || value === 1 || value === 'yes' || value === 'on';
}

function normalizeProvider(value) {
  const v = String(value || 'auto').trim().toLowerCase();
  if (!v || v === 'auto') return 'auto';
  if (['openai', 'gpt', 'chatgpt'].includes(v)) return 'openai';
  if (['anthropic', 'claude'].includes(v)) return 'anthropic';
  if (['google', 'gemini'].includes(v)) return 'google';
  if (['mock', 'test', 'dry_run'].includes(v)) return 'mock';
  return v;
}

function inferIntent(question = '') {
  const q = String(question || '').toLowerCase();
  if (/(code|coding|bug|error|patch|api|route|server|npm|git|db|sql|코드|오류|패치|서버|개발)/i.test(q)) return 'coding';
  if (/(summary|summarize|long|memory|context|import|요약|기억|문맥|대화)/i.test(q)) return 'long_context';
  if (/(why|analyze|strategy|plan|판단|분석|전략|계획)/i.test(q)) return 'reasoning';
  return 'general';
}

async function tableExists(db, name) {
  try {
    const [rows] = await db.query('SHOW TABLES LIKE ?', [name]);
    return rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function columnExists(db, tableName, columnName) {
  try {
    const [rows] = await db.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
    return rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function ensureColumn(db, tableName, columnName, definition) {
  if (!(await columnExists(db, tableName, columnName))) {
    await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function ensureTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS personal_agent_interactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_question LONGTEXT NOT NULL,
      detected_project_code VARCHAR(100) NULL,
      provider_requested VARCHAR(50) NULL,
      provider_used VARCHAR(50) NULL,
      context_summary LONGTEXT NULL,
      context_payload LONGTEXT NULL,
      answer LONGTEXT NULL,
      used_memory_count INT DEFAULT 0,
      used_context_sources LONGTEXT NULL,
      detection_confidence DECIMAL(5,4) NULL,
      detection_reason TEXT NULL,
      matched_keywords TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_project_created (detected_project_code, created_at),
      INDEX idx_provider_created (provider_used, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await ensureColumn(db, 'personal_agent_interactions', 'context_payload', 'LONGTEXT NULL AFTER context_summary');
  await ensureColumn(db, 'personal_agent_interactions', 'used_context_sources', 'LONGTEXT NULL AFTER used_memory_count');
  await ensureColumn(db, 'personal_agent_interactions', 'detection_confidence', 'DECIMAL(5,4) NULL AFTER used_context_sources');
  await ensureColumn(db, 'personal_agent_interactions', 'detection_reason', 'TEXT NULL AFTER detection_confidence');
  await ensureColumn(db, 'personal_agent_interactions', 'matched_keywords', 'TEXT NULL AFTER detection_reason');
  await ensureColumn(db, 'personal_agent_interactions', 'provider_model', 'VARCHAR(255) NULL AFTER provider_used');
  await ensureColumn(db, 'personal_agent_interactions', 'provider_route_payload', 'LONGTEXT NULL AFTER provider_model');
  await ensureColumn(db, 'personal_agent_interactions', 'provider_response_payload', 'LONGTEXT NULL AFTER provider_route_payload');
  await ensureColumn(db, 'personal_agent_interactions', 'provider_live_requested', 'TINYINT(1) DEFAULT 0 AFTER provider_response_payload');
  await ensureColumn(db, 'personal_agent_interactions', 'provider_fallback_used', 'TINYINT(1) DEFAULT 0 AFTER provider_live_requested');

  await db.query(`
    CREATE TABLE IF NOT EXISTS personal_agent_project_rules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_code VARCHAR(100) NOT NULL,
      label VARCHAR(255) NULL,
      keywords LONGTEXT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_project_code (project_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  for (const p of DEFAULT_PROJECTS) {
    await db.query(
      `INSERT IGNORE INTO personal_agent_project_rules (project_code, label, keywords, is_active)
       VALUES (?, ?, ?, 1)`,
      [p.project_code, p.label, JSON.stringify(p.keywords)]
    );
  }
}

async function getProjectRules(db) {
  await ensureTables(db);
  const [rows] = await db.query(
    `SELECT project_code, label, keywords, is_active
     FROM personal_agent_project_rules
     WHERE is_active = 1
     ORDER BY project_code ASC`
  );
  return rows.map((r) => ({
    project_code: r.project_code,
    label: r.label,
    keywords: (() => { try { return JSON.parse(r.keywords || '[]'); } catch (_) { return []; } })()
  }));
}

async function detectProject(db, question, requestedProjectCode = 'auto') {
  if (requestedProjectCode && requestedProjectCode !== 'auto') {
    return {
      detected_project_code: requestedProjectCode,
      detection_mode: 'manual',
      confidence: 1,
      detection_reason: 'User selected project_code manually.',
      matched_keywords: []
    };
  }

  const q = String(question || '').toLowerCase();
  const rules = await getProjectRules(db);
  let best = null;

  for (const rule of rules) {
    const matched = (rule.keywords || []).filter((kw) => q.includes(String(kw).toLowerCase()));
    const score = matched.length;
    if (!best || score > best.score) best = { rule, score, matched };
  }

  if (!best || best.score === 0) {
    return {
      detected_project_code: 'ai_memory_gateway',
      detection_mode: 'fallback',
      confidence: 0.25,
      detection_reason: 'No strong project keyword matched; fallback to ai_memory_gateway.',
      matched_keywords: []
    };
  }

  return {
    detected_project_code: best.rule.project_code,
    detection_mode: 'auto',
    confidence: Math.min(0.95, 0.45 + best.score * 0.15),
    detection_reason: `Matched ${best.score} keyword(s) for ${best.rule.project_code}.`,
    matched_keywords: best.matched
  };
}

async function searchMemoryContext(db, projectCode, question, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 5), 20));
  const keyword = String(question || '').trim().slice(0, 200);
  const like = `%${keyword.split(/\s+/).filter(Boolean).slice(0, 5).join('%')}%`;
  const sources = [];

  if (await tableExists(db, 'ai_memory')) {
    try {
      const [rows] = await db.query(
        `SELECT id, project_code, title, memory_text, summary, created_at
         FROM ai_memory
         WHERE (? IS NULL OR project_code = ?)
           AND (title LIKE ? OR memory_text LIKE ? OR summary LIKE ?)
         ORDER BY id DESC
         LIMIT ${safeLimit}`,
        [projectCode, projectCode, like, like, like]
      );
      for (const r of rows) {
        sources.push({ source_type: 'ai_memory', id: r.id, title: r.title, text: r.summary || r.memory_text || '', created_at: r.created_at });
      }
    } catch (_) {}
  }

  if (sources.length < safeLimit && await tableExists(db, 'raw_imported_conversations')) {
    try {
      const [rows] = await db.query(
        `SELECT id, project_code, source_platform, title, conversation_text, created_at
         FROM raw_imported_conversations
         WHERE (? IS NULL OR project_code = ?)
           AND (title LIKE ? OR conversation_text LIKE ?)
         ORDER BY id DESC
         LIMIT ${safeLimit}`,
        [projectCode, projectCode, like, like]
      );
      for (const r of rows) {
        sources.push({ source_type: 'raw_imported_conversations', id: r.id, title: r.title, text: r.conversation_text || '', source_platform: r.source_platform, created_at: r.created_at });
      }
    } catch (_) {}
  }

  const trimmed = sources.slice(0, safeLimit).map((s) => ({
    ...s,
    text: String(s.text || '').replace(/\s+/g, ' ').slice(0, 700)
  }));

  return {
    project_code: projectCode,
    query: question,
    used_memory_count: trimmed.length,
    sources: trimmed,
    context_summary: trimmed.map((s, i) => `[${i + 1}] ${s.source_type}#${s.id} ${s.title || ''}: ${s.text}`).join('\n')
  };
}

function buildMockAnswer(question, projectCode, context) {
  const count = context?.used_memory_count || 0;
  return [
    `Personal AI Agent mock answer for project: ${projectCode}`,
    `Question: ${question}`,
    `Loaded memory/context items: ${count}`,
    count > 0 ? '검색된 memory context를 기반으로 다음 단계를 제안할 준비가 되었습니다.' : '현재 검색된 memory가 적습니다. 실제 import/summary가 늘어나면 context 품질이 개선됩니다.',
    'Phase 17-4 connects this agent flow to the provider router.'
  ].join('\n');
}

function buildProviderPrompt({ question, projectCode, context, detection }) {
  return [
    'You are the user\'s Personal AI Gateway Agent.',
    'Answer in Korean unless the user explicitly asks for another language.',
    'Use the memory context below as the continuity source of truth.',
    'Do not claim that context exists if it is not shown.',
    '',
    `Detected project_code: ${projectCode}`,
    `Detection reason: ${detection?.detection_reason || ''}`,
    `Loaded memory count: ${context?.used_memory_count || 0}`,
    '',
    '## Memory Context',
    context?.context_summary || '(No relevant memory context was found.)',
    '',
    '## User Question',
    question,
    '',
    '## Response Requirements',
    '- Continue from the stored project context when possible.',
    '- Be practical and step-by-step.',
    '- Clearly state any uncertainty or missing information.'
  ].join('\n');
}

function extractProviderAnswer(providerTest) {
  if (!providerTest) return '';
  if (typeof providerTest.answer === 'string') return providerTest.answer;
  if (typeof providerTest.response?.answer === 'string') return providerTest.response.answer;
  if (typeof providerTest.response?.output_text === 'string') return providerTest.response.output_text;
  if (typeof providerTest.response?.storedAssistantMessage === 'string') return providerTest.response.storedAssistantMessage;
  if (typeof providerTest.provider_test?.response?.answer === 'string') return providerTest.provider_test.response.answer;
  return JSON.stringify(providerTest, null, 2).slice(0, 4000);
}

async function executeProviderAnswer({ question, detected, context, payload }) {
  const requestedProvider = normalizeProvider(payload.provider || 'auto');
  const liveRequested = isTruthy(payload.live) || isTruthy(process.env.AI_AGENT_LIVE_MODE);
  const allowFallback = payload.allow_fallback !== false;
  const intent = payload.intent || inferIntent(question);
  const prompt = buildProviderPrompt({
    question,
    projectCode: detected.detected_project_code,
    context,
    detection: detected
  });

  if (requestedProvider === 'mock' || !providerRouter || !modelProvider?.testProviderAdapter) {
    return {
      answer: buildMockAnswer(question, detected.detected_project_code, context),
      provider_used: 'mock',
      provider_model: process.env.MOCK_DEFAULT_MODEL || 'mock-model',
      provider_route: {
        ok: Boolean(providerRouter),
        route_status: providerRouter ? 'MOCK_FORCED' : 'PROVIDER_ROUTER_NOT_AVAILABLE',
        selected_provider: 'mock',
        selected_model: process.env.MOCK_DEFAULT_MODEL || 'mock-model'
      },
      provider_response: { adapter_status: 'MOCK_AGENT_RESPONSE' },
      live_requested: liveRequested,
      fallback_used: requestedProvider !== 'mock'
    };
  }

  const preferredProvider = requestedProvider === 'auto' ? null : requestedProvider;
  const route = await providerRouter.selectProviderRoute({
    intent,
    preferred_provider: preferredProvider,
    force_provider: null,
    live: liveRequested,
    require_live: false,
    allow_fallback: allowFallback,
    prompt
  });

  if (!route.ok || !route.selected_provider) {
    if (!allowFallback) {
      return {
        answer: `Provider route selection failed. ${route.errors?.join('; ') || ''}`,
        provider_used: 'none',
        provider_model: null,
        provider_route: route,
        provider_response: null,
        live_requested: liveRequested,
        fallback_used: false
      };
    }

    return {
      answer: buildMockAnswer(question, detected.detected_project_code, context),
      provider_used: 'mock',
      provider_model: process.env.MOCK_DEFAULT_MODEL || 'mock-model',
      provider_route: route,
      provider_response: { adapter_status: 'MOCK_FALLBACK_AFTER_ROUTE_FAILURE' },
      live_requested: liveRequested,
      fallback_used: true
    };
  }

  try {
    const providerTest = await modelProvider.testProviderAdapter({
      provider: route.selected_provider,
      model_name: route.selected_model,
      prompt,
      live: liveRequested
    });

    return {
      answer: extractProviderAnswer(providerTest),
      provider_used: route.selected_provider,
      provider_model: route.selected_model,
      provider_route: route,
      provider_response: providerTest,
      live_requested: liveRequested,
      fallback_used: requestedProvider !== 'auto' && route.selected_provider !== requestedProvider
    };
  } catch (error) {
    if (!allowFallback) throw error;
    return {
      answer: buildMockAnswer(question, detected.detected_project_code, context) + `\n\n[Provider fallback note] ${error.message}`,
      provider_used: 'mock',
      provider_model: process.env.MOCK_DEFAULT_MODEL || 'mock-model',
      provider_route: route,
      provider_response: { adapter_status: 'PROVIDER_EXECUTION_FAILED_MOCK_FALLBACK', error: error.message },
      live_requested: liveRequested,
      fallback_used: true
    };
  }
}

async function getStatus(db) {
  await ensureTables(db);
  const [rules] = await db.query('SELECT COUNT(*) AS cnt FROM personal_agent_project_rules WHERE is_active = 1');
  let routerStatus = null;
  try {
    routerStatus = providerRouter?.getProviderRouterStatus ? await providerRouter.getProviderRouterStatus() : null;
  } catch (error) {
    routerStatus = { ok: false, error: error.message };
  }

  return {
    ok: true,
    agent_status: providerRouter ? 'READY' : 'READY_WITH_MOCK_ONLY',
    phase: '17-4',
    feature: 'provider_router_real_ai_response_connection',
    active_project_rules: Number(rules[0]?.cnt || 0),
    provider_router_available: Boolean(providerRouter),
    model_provider_available: Boolean(modelProvider?.testProviderAdapter),
    live_mode: {
      ai_agent_live_mode: isTruthy(process.env.AI_AGENT_LIVE_MODE),
      ai_live_mode: isTruthy(process.env.AI_LIVE_MODE)
    },
    router_status: routerStatus,
    phase17_5_entry_allowed: true,
    checked_at: nowIso()
  };
}

async function ask(db, payload = {}) {
  await ensureTables(db);
  const question = String(payload.question || '').trim();
  if (!question) throw new Error('question is required');

  const requestedProvider = normalizeProvider(payload.provider || 'auto');
  const detected = await detectProject(db, question, payload.project_code || 'auto');
  const context = await searchMemoryContext(db, detected.detected_project_code, question, payload.context_limit || 5);
  const providerResult = await executeProviderAnswer({ question, detected, context, payload: { ...payload, provider: requestedProvider } });

  const [result] = await db.query(
    `INSERT INTO personal_agent_interactions
      (user_question, detected_project_code, provider_requested, provider_used, provider_model, provider_route_payload, provider_response_payload, provider_live_requested, provider_fallback_used, context_summary, context_payload, answer, used_memory_count, used_context_sources, detection_confidence, detection_reason, matched_keywords)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      question,
      detected.detected_project_code,
      requestedProvider,
      providerResult.provider_used,
      providerResult.provider_model,
      safeJson(providerResult.provider_route),
      safeJson(providerResult.provider_response),
      providerResult.live_requested ? 1 : 0,
      providerResult.fallback_used ? 1 : 0,
      context.context_summary,
      safeJson(context),
      providerResult.answer,
      context.used_memory_count,
      safeJson(context.sources),
      detected.confidence,
      detected.detection_reason,
      JSON.stringify(detected.matched_keywords || [])
    ]
  );

  return {
    ok: true,
    phase: '17-4',
    interaction_id: result.insertId,
    detected_project_code: detected.detected_project_code,
    detection: detected,
    provider_requested: requestedProvider,
    provider_used: providerResult.provider_used,
    provider_model: providerResult.provider_model,
    provider_live_requested: providerResult.live_requested,
    provider_fallback_used: providerResult.fallback_used,
    provider_route_status: providerResult.provider_route?.route_status || null,
    used_memory_count: context.used_memory_count,
    context_preview: context.context_summary,
    context_sources: context.sources,
    answer: providerResult.answer,
    saved: true
  };
}

async function test(db, payload = {}) {
  const response = await ask(db, {
    project_code: payload.project_code || 'auto',
    provider: payload.provider || 'auto',
    context_limit: payload.context_limit || 5,
    question: payload.question || 'AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 다음 단계 알려주세요.',
    live: payload.live === true,
    allow_fallback: payload.allow_fallback !== false,
    intent: payload.intent || 'coding'
  });
  return { ok: true, test_status: 'PASS', phase17_5_entry_allowed: true, response };
}

module.exports = {
  ensureTables,
  getStatus,
  getProjectRules,
  detectProject,
  searchMemoryContext,
  executeProviderAnswer,
  ask,
  test
};
