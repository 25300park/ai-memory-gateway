'use strict';

/**
 * Phase 17 Personal Agent Service
 * Phase 17-6: Continue Project Feature
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


async function countRows(db, tableName, whereSql = '', params = []) {
  try {
    if (!(await tableExists(db, tableName))) return 0;
    const [rows] = await db.query(`SELECT COUNT(*) AS cnt FROM ${tableName} ${whereSql}`, params);
    return Number(rows[0]?.cnt || 0);
  } catch (_) {
    return 0;
  }
}

function buildAgentSessionId(projectCode, payload = {}) {
  if (payload.session_id) return String(payload.session_id).trim().slice(0, 180);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `agent-${projectCode || 'auto'}-${date}`;
}

function summarizeAnswer(answer = '') {
  return String(answer || '').replace(/\s+/g, ' ').slice(0, 500);
}

async function getNextAgentTurnNo(db, sessionId) {
  try {
    const [rows] = await db.query(
      `SELECT COALESCE(MAX(agent_turn_no), 0) + 1 AS next_turn
       FROM personal_agent_interactions
       WHERE agent_session_id = ?`,
      [sessionId]
    );
    return Number(rows[0]?.next_turn || 1);
  } catch (_) {
    return 1;
  }
}

async function saveAgentConversationLog(db, payload = {}) {
  if (!(await tableExists(db, 'ai_conversation_logs'))) {
    return { ok: false, skipped: true, reason: 'ai_conversation_logs table not found' };
  }

  const projectCode = payload.project_code || 'ai_memory_gateway';
  const sessionId = payload.session_id || buildAgentSessionId(projectCode, payload);
  const answer = String(payload.answer || '');
  const question = String(payload.question || '');
  const contextSummary = String(payload.context_summary || '');
  const rawText = [
    '# Personal AI Agent Interaction',
    `Project: ${projectCode}`,
    `Provider: ${payload.provider_used || ''}`,
    `Model: ${payload.provider_model || ''}`,
    '',
    '## User Question',
    question,
    '',
    '## Memory Context Summary',
    contextSummary || '(No context summary)',
    '',
    '## Agent Answer',
    answer
  ].join('\n');

  try {
    const [result] = await db.query(
      `INSERT INTO ai_conversation_logs (
         project_code,
         session_id,
         source_ai,
         conversation_title,
         user_message,
         assistant_message,
         raw_text,
         summary,
         model_name,
         token_count,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectCode,
        sessionId,
        payload.provider_used || 'personal_agent',
        payload.conversation_title || `Personal Agent - ${projectCode}`,
        question,
        answer,
        rawText,
        summarizeAnswer(answer),
        payload.provider_model || payload.provider_used || 'agent-router',
        0,
        'active'
      ]
    );

    return { ok: true, conversation_log_id: Number(result.insertId), session_id: sessionId };
  } catch (error) {
    return { ok: false, skipped: false, error: error.message, code: error.code };
  }
}

async function queueAgentConversationForSummary(db, conversationLogId, projectCode, payload = {}) {
  if (!conversationLogId) return { ok: false, skipped: true, reason: 'conversation_log_id missing' };
  if (!(await tableExists(db, 'ai_summary_queue'))) {
    return { ok: false, skipped: true, reason: 'ai_summary_queue table not found' };
  }

  try {
    const [result] = await db.query(
      `INSERT INTO ai_summary_queue (
         conversation_log_id,
         project_code,
         source_ai,
         summary_model,
         status,
         priority
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        conversationLogId,
        projectCode || 'ai_memory_gateway',
        payload.provider_used || 'personal_agent',
        payload.summary_model || 'gpt-4o-mini',
        'pending',
        Number(payload.priority || 4)
      ]
    );
    return { ok: true, summary_queue_id: Number(result.insertId) };
  } catch (error) {
    return { ok: false, skipped: false, error: error.message, code: error.code };
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
  await ensureColumn(db, 'personal_agent_interactions', 'agent_session_id', 'VARCHAR(180) NULL AFTER id');
  await ensureColumn(db, 'personal_agent_interactions', 'agent_turn_no', 'INT DEFAULT 1 AFTER agent_session_id');
  await ensureColumn(db, 'personal_agent_interactions', 'conversation_log_id', 'BIGINT UNSIGNED NULL AFTER provider_fallback_used');
  await ensureColumn(db, 'personal_agent_interactions', 'summary_queue_id', 'BIGINT UNSIGNED NULL AFTER conversation_log_id');
  await ensureColumn(db, 'personal_agent_interactions', 'auto_saved_to_conversation_log', 'TINYINT(1) DEFAULT 0 AFTER summary_queue_id');
  await ensureColumn(db, 'personal_agent_interactions', 'auto_queued_for_summary', 'TINYINT(1) DEFAULT 0 AFTER auto_saved_to_conversation_log');
  await ensureColumn(db, 'personal_agent_interactions', 'save_status', 'VARCHAR(80) NULL AFTER auto_queued_for_summary');
  await ensureColumn(db, 'personal_agent_interactions', 'save_error', 'TEXT NULL AFTER save_status');
  await ensureColumn(db, 'personal_agent_interactions', 'answer_summary', 'TEXT NULL AFTER answer');

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

function getProjectAliases(projectCode) {
  const normalized = String(projectCode || '').trim();
  const aliases = new Set();
  if (normalized) aliases.add(normalized);

  const aliasMap = {
    ai_memory_gateway: ['ai_memory_gateway', 'rbs_ai_memory'],
    rbs_ai_memory: ['rbs_ai_memory', 'ai_memory_gateway'],
    rbs_homes: ['rbs_homes', 'sns_brokerage_automation'],
    sns_brokerage_automation: ['sns_brokerage_automation', 'rbs_homes']
  };

  for (const value of aliasMap[normalized] || []) aliases.add(value);
  return Array.from(aliases).filter(Boolean);
}

function buildSearchTerms(question = '') {
  const raw = String(question || '').trim();
  const tokens = raw
    .toLowerCase()
    .replace(/["'`~!@#$%^&*()_+=\[\]{}|\\:;,.<>/?-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 2)
    .filter((t) => !['the', 'and', 'for', 'with', 'from', 'this', 'that', 'about', 'into', 'your', 'you', 'are', 'was', 'were', '내용', '관련', '이어서', '설명해주세요', '프로젝트'].includes(t));

  const unique = [];
  for (const token of tokens) {
    if (!unique.includes(token)) unique.push(token);
    if (unique.length >= 8) break;
  }

  return unique.length ? unique : raw ? [raw.slice(0, 80)] : [];
}

function scoreMemoryRow(row, terms = []) {
  const haystack = [row.title, row.summary, row.detail, row.tags, row.source_ai]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  let score = 0;
  for (const term of terms) {
    if (term && haystack.includes(String(term).toLowerCase())) score += 1;
  }
  if (String(row.source_ai || '').toLowerCase() === 'claude') score += 0.15;
  if (String(row.status || '').toLowerCase() === 'active') score += 0.1;
  return score;
}

async function searchMemoryContext(db, projectCode, question, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 5), 20));
  const projectAliases = getProjectAliases(projectCode);
  const terms = buildSearchTerms(question);
  const sources = [];
  const seen = new Set();

  function addSource(source) {
    const key = `${source.source_type}:${source.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  }

  const projectWhere = projectAliases.length
    ? `project_code IN (${projectAliases.map(() => '?').join(',')})`
    : '1=1';

  if (await tableExists(db, 'ai_memory')) {
    try {
      const likeClauses = [];
      const params = [...projectAliases];
      for (const term of terms) {
        const like = `%${term}%`;
        likeClauses.push('(title LIKE ? OR summary LIKE ? OR detail LIKE ? OR tags LIKE ? OR source_ai LIKE ?)');
        params.push(like, like, like, like, like);
      }

      const keywordWhere = likeClauses.length ? `AND (${likeClauses.join(' OR ')})` : '';
      const [rows] = await db.query(
        `SELECT id, project_code, source_ai, memory_type, title, summary, detail, tags, status, created_at
         FROM ai_memory
         WHERE ${projectWhere}
           AND (status IS NULL OR status = 'active')
           ${keywordWhere}
         ORDER BY id DESC
         LIMIT ${safeLimit}`,
        params
      );

      const scoredRows = rows
        .map((r) => ({ ...r, _score: scoreMemoryRow(r, terms) }))
        .sort((a, b) => b._score - a._score || Number(b.id || 0) - Number(a.id || 0));

      for (const r of scoredRows) {
        addSource({
          source_type: 'ai_memory',
          id: r.id,
          project_code: r.project_code,
          source_ai: r.source_ai,
          memory_type: r.memory_type,
          title: r.title,
          text: r.summary || r.detail || '',
          detail: r.detail || '',
          tags: r.tags || '',
          score: r._score,
          created_at: r.created_at
        });
      }
    } catch (error) {
      // Keep the agent usable even if a legacy table has unexpected columns.
    }

    // Fallback: if keyword search finds nothing, load latest active project memories.
    if (sources.length === 0) {
      try {
        const [rows] = await db.query(
          `SELECT id, project_code, source_ai, memory_type, title, summary, detail, tags, status, created_at
           FROM ai_memory
           WHERE ${projectWhere}
             AND (status IS NULL OR status = 'active')
           ORDER BY id DESC
           LIMIT ${safeLimit}`,
          projectAliases
        );

        for (const r of rows) {
          addSource({
            source_type: 'ai_memory_fallback_latest',
            id: r.id,
            project_code: r.project_code,
            source_ai: r.source_ai,
            memory_type: r.memory_type,
            title: r.title,
            text: r.summary || r.detail || '',
            detail: r.detail || '',
            tags: r.tags || '',
            score: 0,
            created_at: r.created_at
          });
        }
      } catch (error) {
        // ignore fallback failures
      }
    }
  }

  if (sources.length < safeLimit && await tableExists(db, 'raw_imported_conversations')) {
    try {
      const remaining = safeLimit - sources.length;
      const likeClauses = [];
      const params = [...projectAliases];
      for (const term of terms) {
        const like = `%${term}%`;
        likeClauses.push('(title LIKE ? OR source_platform LIKE ? OR import_status LIKE ?)');
        params.push(like, like, like);
      }
      const keywordWhere = likeClauses.length ? `AND (${likeClauses.join(' OR ')})` : '';
      const [rows] = await db.query(
        `SELECT id, project_code, source_platform, title, import_status, summary_queue_id, memory_id, created_at
         FROM raw_imported_conversations
         WHERE ${projectWhere}
           ${keywordWhere}
         ORDER BY id DESC
         LIMIT ${remaining}`,
        params
      );

      for (const r of rows) {
        addSource({
          source_type: 'raw_imported_conversations',
          id: r.id,
          project_code: r.project_code,
          source_platform: r.source_platform,
          title: r.title,
          text: `Import status: ${r.import_status || ''}; summary_queue_id: ${r.summary_queue_id || ''}; memory_id: ${r.memory_id || ''}`,
          created_at: r.created_at
        });
      }
    } catch (error) {
      // ignore optional imported conversation search failures
    }
  }

  const trimmed = sources.slice(0, safeLimit).map((s) => ({
    ...s,
    text: String(s.text || '').replace(/\s+/g, ' ').slice(0, 900),
    detail: String(s.detail || '').replace(/\s+/g, ' ').slice(0, 900)
  }));

  return {
    project_code: projectCode,
    project_aliases: projectAliases,
    query: question,
    search_terms: terms,
    used_memory_count: trimmed.length,
    sources: trimmed,
    context_summary: trimmed.map((s, i) => {
      const sourceLabel = s.source_ai || s.source_platform || '';
      const body = s.text || s.detail || '';
      return `[${i + 1}] ${s.source_type}#${s.id} ${sourceLabel} ${s.title || ''}: ${body}`;
    }).join('\n')
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


async function getRecentProjectInteractions(db, projectCode, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 5), 20));
  if (!(await tableExists(db, 'personal_agent_interactions'))) return [];
  try {
    const [rows] = await db.query(
      `SELECT id, agent_session_id, agent_turn_no, user_question, answer_summary, answer,
              detected_project_code, provider_used, provider_model, used_memory_count,
              save_status, created_at
       FROM personal_agent_interactions
       WHERE detected_project_code = ?
       ORDER BY id DESC
       LIMIT ${safeLimit}`,
      [projectCode]
    );
    return rows.map((r) => ({
      id: r.id,
      session_id: r.agent_session_id,
      turn_no: r.agent_turn_no,
      question: r.user_question,
      answer_summary: r.answer_summary || summarizeAnswer(r.answer || ''),
      provider_used: r.provider_used,
      provider_model: r.provider_model,
      used_memory_count: r.used_memory_count,
      save_status: r.save_status,
      created_at: r.created_at
    }));
  } catch (_) {
    return [];
  }
}

async function getRecentConversationLogs(db, projectCode, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 5), 20));
  if (!(await tableExists(db, 'ai_conversation_logs'))) return [];
  try {
    const [rows] = await db.query(
      `SELECT id, project_code, session_id, source_ai, conversation_title, summary,
              user_message, assistant_message, model_name, status, created_at
       FROM ai_conversation_logs
       WHERE project_code = ?
       ORDER BY id DESC
       LIMIT ${safeLimit}`,
      [projectCode]
    );
    return rows.map((r) => ({
      id: r.id,
      session_id: r.session_id,
      source_ai: r.source_ai,
      title: r.conversation_title,
      summary: r.summary || summarizeAnswer(r.assistant_message || r.user_message || ''),
      model_name: r.model_name,
      status: r.status,
      created_at: r.created_at
    }));
  } catch (_) {
    return [];
  }
}

function buildContinuePrompt({ projectCode, question, context, recentInteractions, recentLogs }) {
  const interactionsText = recentInteractions.map((r, i) => (
    `[${i + 1}] ${r.created_at || ''} / ${r.provider_used || ''}\nQ: ${String(r.question || '').slice(0, 300)}\nA: ${String(r.answer_summary || '').slice(0, 500)}`
  )).join('\n\n');
  const logsText = recentLogs.map((r, i) => (
    `[${i + 1}] ${r.created_at || ''} / ${r.source_ai || ''} / ${r.title || ''}\n${String(r.summary || '').slice(0, 500)}`
  )).join('\n\n');
  return [
    'You are continuing an existing project for the user.',
    'Answer in Korean unless the user asks otherwise.',
    'Use the stored memory and recent activity below as the continuity source of truth.',
    '',
    `Project code: ${projectCode}`,
    '',
    '## Current user request',
    question || '이 프로젝트를 이어서 진행하겠습니다. 현재 상태와 다음 단계를 알려주세요.',
    '',
    '## Memory Context',
    context?.context_summary || '(No memory context found.)',
    '',
    '## Recent Personal Agent Interactions',
    interactionsText || '(No recent Personal Agent interactions found.)',
    '',
    '## Recent Conversation Logs',
    logsText || '(No recent conversation logs found.)',
    '',
    '## Response Requirements',
    '- Start with the current project status.',
    '- Then list the next recommended step.',
    '- Mention what information is missing, if any.',
    '- Keep the response practical and directly actionable.'
  ].join('\n');
}

async function continueProject(db, payload = {}) {
  await ensureTables(db);
  const rawQuestion = String(payload.question || '').trim();
  const question = rawQuestion || '이 프로젝트를 이어서 진행하겠습니다. 현재 상태와 다음 단계를 알려주세요.';
  const detected = await detectProject(db, question, payload.project_code || 'auto');
  const projectCode = detected.detected_project_code;
  const context = await searchMemoryContext(db, projectCode, question, payload.context_limit || 8);
  const recentInteractions = await getRecentProjectInteractions(db, projectCode, payload.recent_limit || 5);
  const recentLogs = await getRecentConversationLogs(db, projectCode, payload.recent_limit || 5);

  const continuePrompt = buildContinuePrompt({ projectCode, question, context, recentInteractions, recentLogs });
  const response = await ask(db, {
    ...payload,
    project_code: projectCode,
    question: continuePrompt,
    provider: payload.provider || 'mock',
    context_limit: payload.context_limit || 8,
    enqueue_summary: payload.enqueue_summary === true,
    session_id: payload.session_id || buildAgentSessionId(projectCode, { session_id: `continue-${projectCode}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}` })
  });

  return {
    ok: true,
    phase: '17-6',
    continue_status: 'READY',
    requested_project_code: payload.project_code || 'auto',
    detected_project_code: projectCode,
    detection: detected,
    used_memory_count: context.used_memory_count,
    recent_interaction_count: recentInteractions.length,
    recent_log_count: recentLogs.length,
    continue_prompt_preview: continuePrompt.slice(0, 4000),
    response,
    phase17_7_entry_allowed: true
  };
}

async function continueProjectTest(db, payload = {}) {
  const result = await continueProject(db, {
    project_code: payload.project_code || 'auto',
    provider: payload.provider || 'mock',
    context_limit: payload.context_limit || 5,
    recent_limit: payload.recent_limit || 3,
    question: payload.question || 'AI Memory Gateway 프로젝트 이어서 진행하겠습니다. 현재 상태와 다음 단계 알려주세요.',
    enqueue_summary: false,
    live: false,
    allow_fallback: true
  });
  return { ok: true, test_status: 'PASS', phase17_7_entry_allowed: true, result };
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
    phase: '17-6',
    feature: 'continue_project_memory_bootstrap',
    active_project_rules: Number(rules[0]?.cnt || 0),
    provider_router_available: Boolean(providerRouter),
    model_provider_available: Boolean(modelProvider?.testProviderAdapter),
    live_mode: {
      ai_agent_live_mode: isTruthy(process.env.AI_AGENT_LIVE_MODE),
      ai_live_mode: isTruthy(process.env.AI_LIVE_MODE)
    },
    router_status: routerStatus,
    continue_project_available: true,
    storage_counts: {
      personal_agent_interactions: await countRows(db, 'personal_agent_interactions'),
      ai_conversation_logs: await countRows(db, 'ai_conversation_logs'),
      ai_summary_queue: await countRows(db, 'ai_summary_queue')
    },
    phase17_7_entry_allowed: true,
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
  const agentSessionId = buildAgentSessionId(detected.detected_project_code, payload);
  const agentTurnNo = await getNextAgentTurnNo(db, agentSessionId);
  const answerSummary = summarizeAnswer(providerResult.answer);

  const [result] = await db.query(
    `INSERT INTO personal_agent_interactions
      (agent_session_id, agent_turn_no, user_question, detected_project_code, provider_requested, provider_used, provider_model, provider_route_payload, provider_response_payload, provider_live_requested, provider_fallback_used, context_summary, context_payload, answer, answer_summary, used_memory_count, used_context_sources, detection_confidence, detection_reason, matched_keywords, save_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agentSessionId,
      agentTurnNo,
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
      answerSummary,
      context.used_memory_count,
      safeJson(context.sources),
      detected.confidence,
      detected.detection_reason,
      JSON.stringify(detected.matched_keywords || []),
      'interaction_saved'
    ]
  );

  const interactionId = Number(result.insertId);
  const logSave = await saveAgentConversationLog(db, {
    ...payload,
    project_code: detected.detected_project_code,
    session_id: agentSessionId,
    question,
    answer: providerResult.answer,
    context_summary: context.context_summary,
    provider_used: providerResult.provider_used,
    provider_model: providerResult.provider_model,
    conversation_title: `Personal Agent - ${detected.detected_project_code}`
  });

  let queueSave = { ok: false, skipped: true, reason: 'enqueue_summary not requested' };
  if (logSave.ok && isTruthy(payload.enqueue_summary)) {
    queueSave = await queueAgentConversationForSummary(db, logSave.conversation_log_id, detected.detected_project_code, {
      ...payload,
      provider_used: providerResult.provider_used
    });
  }

  const finalSaveStatus = logSave.ok
    ? (queueSave.ok ? 'interaction_conversation_log_summary_queued' : 'interaction_conversation_log_saved')
    : 'interaction_saved_only';
  const saveError = logSave.ok ? (queueSave.ok || queueSave.skipped ? null : queueSave.error) : logSave.error;

  await db.query(
    `UPDATE personal_agent_interactions
     SET conversation_log_id = ?,
         summary_queue_id = ?,
         auto_saved_to_conversation_log = ?,
         auto_queued_for_summary = ?,
         save_status = ?,
         save_error = ?
     WHERE id = ?`,
    [
      logSave.conversation_log_id || null,
      queueSave.summary_queue_id || null,
      logSave.ok ? 1 : 0,
      queueSave.ok ? 1 : 0,
      finalSaveStatus,
      saveError || null,
      interactionId
    ]
  );

  return {
    ok: true,
    phase: '17-6',
    interaction_id: interactionId,
    agent_session_id: agentSessionId,
    agent_turn_no: agentTurnNo,
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
    answer_summary: answerSummary,
    saved: true,
    storage: {
      save_status: finalSaveStatus,
      conversation_log: logSave,
      summary_queue: queueSave
    }
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
  return { ok: true, test_status: 'PASS', phase17_7_entry_allowed: true, response };
}


async function ensureOperationLogsTable(db) {
  await ensureTables(db);
  await db.query(`
    CREATE TABLE IF NOT EXISTS personal_agent_operation_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      operation_type VARCHAR(80) NOT NULL,
      project_code VARCHAR(120) NULL,
      provider_used VARCHAR(80) NULL,
      interaction_id BIGINT UNSIGNED NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'ok',
      message TEXT NULL,
      payload JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_operation_type (operation_type),
      INDEX idx_project_code (project_code),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function recordOperationLog(db, payload = {}) {
  try {
    await ensureOperationLogsTable(db);
    const [result] = await db.query(
      `INSERT INTO personal_agent_operation_logs (
         operation_type, project_code, provider_used, interaction_id, status, message, payload
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.operation_type || 'agent_operation',
        payload.project_code || null,
        payload.provider_used || null,
        payload.interaction_id || null,
        payload.status || 'ok',
        payload.message || null,
        safeJson(payload.payload || {})
      ]
    );
    return { ok: true, operation_log_id: Number(result.insertId) };
  } catch (error) {
    return { ok: false, error: error.message, code: error.code };
  }
}

async function getOperationLogsStatus(db) {
  await ensureOperationLogsTable(db);
  const interactionCount = await countRows(db, 'personal_agent_interactions');
  const operationLogCount = await countRows(db, 'personal_agent_operation_logs');
  const todayCount = await countRows(db, 'personal_agent_interactions', 'WHERE DATE(created_at) = CURDATE()');
  const [recentRows] = await db.query(
    `SELECT id, operation_type, project_code, provider_used, interaction_id, status, message, created_at
     FROM personal_agent_operation_logs
     ORDER BY id DESC
     LIMIT 5`
  );
  return {
    ok: true,
    phase: '17-7',
    operation_logs_status: 'READY',
    phase17_final_entry_allowed: true,
    counts: {
      personal_agent_interactions: interactionCount,
      personal_agent_operation_logs: operationLogCount,
      today_interactions: todayCount
    },
    recent_operation_logs: recentRows
  };
}

async function getUsageHistory(db, payload = {}) {
  await ensureOperationLogsTable(db);
  const limit = Math.min(Number(payload.limit || 20), 100);
  const projectCode = payload.project_code && payload.project_code !== 'all' ? String(payload.project_code) : null;
  const provider = payload.provider && payload.provider !== 'all' ? normalizeProvider(payload.provider) : null;
  const params = [];
  const where = [];
  if (projectCode) { where.push('detected_project_code = ?'); params.push(projectCode); }
  if (provider) { where.push('provider_used = ?'); params.push(provider); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit);
  const [rows] = await db.query(
    `SELECT id, agent_session_id, agent_turn_no, detected_project_code,
            provider_requested, provider_used, provider_model,
            used_memory_count, save_status, answer_summary, created_at
     FROM personal_agent_interactions
     ${whereSql}
     ORDER BY id DESC
     LIMIT ?`,
    params
  );
  return {
    ok: true,
    phase: '17-7',
    usage_history_status: 'READY',
    filters: { project_code: projectCode || 'all', provider: provider || 'all', limit },
    rows
  };
}

async function getOperationLogs(db, payload = {}) {
  await ensureOperationLogsTable(db);
  const limit = Math.min(Number(payload.limit || 50), 200);
  const status = payload.status && payload.status !== 'all' ? String(payload.status) : null;
  const params = [];
  const where = [];
  if (status) { where.push('status = ?'); params.push(status); }
  params.push(limit);
  const [rows] = await db.query(
    `SELECT id, operation_type, project_code, provider_used, interaction_id, status, message, created_at
     FROM personal_agent_operation_logs
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY id DESC
     LIMIT ?`,
    params
  );
  return { ok: true, phase: '17-7', operation_logs: rows };
}

async function operationLogsTest(db, payload = {}) {
  const history = await getUsageHistory(db, { limit: payload.limit || 5 });
  const log = await recordOperationLog(db, {
    operation_type: 'phase17_7_test',
    project_code: payload.project_code || 'ai_memory_gateway',
    provider_used: payload.provider || 'mock',
    status: 'ok',
    message: 'Phase 17-7 operation logs test executed.',
    payload: { history_count: history.rows.length, tested_at: nowIso() }
  });
  const status = await getOperationLogsStatus(db);
  return {
    ok: true,
    test_status: 'PASS',
    phase: '17-7',
    phase17_final_entry_allowed: true,
    operation_log: log,
    status,
    history_sample_count: history.rows.length
  };
}

module.exports = {
  ensureTables,
  getStatus,
  getProjectRules,
  detectProject,
  searchMemoryContext,
  executeProviderAnswer,
  saveAgentConversationLog,
  queueAgentConversationForSummary,
  getRecentProjectInteractions,
  getRecentConversationLogs,
  buildContinuePrompt,
  continueProject,
  continueProjectTest,
  ask,
  test,
  ensureOperationLogsTable,
  recordOperationLog,
  getOperationLogsStatus,
  getUsageHistory,
  getOperationLogs,
  operationLogsTest
};
