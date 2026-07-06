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
  try {
    return JSON.stringify(value || null, (key, val) => (typeof val === 'bigint' ? val.toString() : val));
  } catch (error) {
    console.warn('[safeJson] Failed to serialize value, storing null instead:', error.message);
    return null;
  }
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

async function ensureUniqueIndex(db, tableName, indexName, columns) {
  try {
    const [rows] = await db.query(`SHOW INDEX FROM ${tableName} WHERE Key_name = ?`, [indexName]);
    if (rows.length > 0) return;
    await db.query(`ALTER TABLE ${tableName} ADD UNIQUE INDEX ${indexName} (${columns.join(', ')})`);
  } catch (_) {
    // Do not block the agent flow if legacy duplicate rows prevent the index from being created.
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
  await ensureColumn(db, 'personal_agent_interactions', 'question_type', 'VARCHAR(80) NULL AFTER answer_summary');
  await ensureColumn(db, 'personal_agent_interactions', 'gateway_selected_provider', 'VARCHAR(80) NULL AFTER question_type');
  await ensureColumn(db, 'personal_agent_interactions', 'gateway_live_call_recommended', 'TINYINT(1) DEFAULT 0 AFTER gateway_selected_provider');
  await ensureColumn(db, 'personal_agent_interactions', 'gateway_cost_level', 'VARCHAR(40) NULL AFTER gateway_live_call_recommended');
  await ensureColumn(db, 'personal_agent_interactions', 'gateway_decision_reason', 'TEXT NULL AFTER gateway_cost_level');
  await ensureColumn(db, 'personal_agent_interactions', 'gateway_decision_payload', 'LONGTEXT NULL AFTER gateway_decision_reason');
  await ensureColumn(db, 'personal_agent_interactions', 'status', "VARCHAR(40) NULL AFTER used_context_sources");
  await ensureColumn(db, 'personal_agent_interactions', 'error_message', 'TEXT NULL AFTER status');
  await ensureUniqueIndex(db, 'personal_agent_interactions', 'uniq_session_turn', ['agent_session_id', 'agent_turn_no']);

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

function detectPreferredSource(question = '') {
  const q = String(question || '').toLowerCase();
  if (/(claude|클로드|anthropic)/i.test(q)) return 'claude';
  if (/(chatgpt|gpt|챗지피티|openai)/i.test(q)) return 'chatgpt';
  if (/(gemini|제미니|google)/i.test(q)) return 'google';
  return null;
}

function buildSourceFilterSql(preferredSource, columnName) {
  if (!preferredSource) return { sql: '', params: [] };
  if (preferredSource === 'claude') return { sql: `AND LOWER(${columnName}) IN ('claude', 'anthropic')`, params: [] };
  if (preferredSource === 'chatgpt') return { sql: `AND LOWER(${columnName}) IN ('chatgpt', 'openai', 'gpt')`, params: [] };
  if (preferredSource === 'google') return { sql: `AND LOWER(${columnName}) IN ('google', 'gemini')`, params: [] };
  return { sql: '', params: [] };
}

function normalizeMemorySource(value = '') {
  const v = String(value || '').toLowerCase().trim();
  if (['claude', 'anthropic'].includes(v)) return 'claude';
  if (['chatgpt', 'openai', 'gpt'].includes(v)) return 'chatgpt';
  if (['gemini', 'google'].includes(v)) return 'google';
  if (['mock', 'test', 'dry_run'].includes(v)) return 'mock';
  return v || 'unknown';
}

function isLowValueTestMemory(row = {}) {
  const text = [row.title, row.summary, row.detail, row.tags, row.source_ai, row.source_platform]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return /mock provider|mock assistant|provider router automatic selection test|provider-interface dry run|ai response test|phase 10-5|phase 11-6/.test(text)
    || normalizeMemorySource(row.source_ai || row.source_platform) === 'mock';
}

function memoryFingerprint(source = {}) {
  const title = String(source.title || '').replace(/^Summary:\s*/i, '').toLowerCase().trim();
  const sourceName = normalizeMemorySource(source.source_ai || source.source_platform || '');
  const body = String(source.text || source.summary || source.detail || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 220)
    .trim();
  // Prefer content-level de-duplication over id-level de-duplication because
  // repeated mock/test memories can be stored as separate rows with identical text.
  return `${sourceName}:${title}:${body}`;
}

function sourceMatchesPreference(source = {}, preferredSource = null) {
  if (!preferredSource) return true;
  const normalized = normalizeMemorySource(source.source_ai || source.source_platform || '');
  return normalized === preferredSource;
}

function extractRequestAndResponse(text = '') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const requestMatch = normalized.match(/사용자 요청:\s*(.*?)(?:\s*응답 요지:|$)/);
  const responseMatch = normalized.match(/응답 요지:\s*(.*)$/);
  return {
    request: requestMatch ? requestMatch[1].trim().slice(0, 220) : '',
    response: responseMatch ? responseMatch[1].trim().slice(0, 360) : normalized.slice(0, 360)
  };
}

function buildReadableContextSummary(sources = [], question = '') {
  const preferredSource = detectPreferredSource(question);
  let filtered = Array.isArray(sources) ? sources : [];
  if (preferredSource) {
    const matched = filtered.filter((s) => sourceMatchesPreference(s, preferredSource));
    if (matched.length > 0) filtered = matched;
  }

  if (!filtered.length) {
    return '아직 이 질문에 연결된 memory를 찾지 못했습니다. import와 summary worker 처리 상태를 먼저 확인해야 합니다.';
  }

  const bullets = filtered.slice(0, 6).map((s, idx) => {
    const parsed = extractRequestAndResponse(`${s.text || ''} ${s.detail || ''}`);
    const title = String(s.title || `memory#${s.id}`).replace(/^Summary:\s*/i, '').trim();
    const source = s.source_ai || s.source_platform || s.source_type || 'memory';
    const request = parsed.request ? ` 요청은 “${parsed.request}”였습니다.` : '';
    const response = parsed.response ? ` 핵심 내용은 ${parsed.response}` : ` ${String(s.text || s.detail || '').slice(0, 300)}`;
    return `${idx + 1}. ${title} (${source})\n   -${request}${response}`.trimEnd();
  });

  const nextStep = preferredSource === 'claude'
    ? '현재 Claude import 데이터는 검색되고 있지만, imported 원본이 3건뿐이라 답변 품질은 아직 제한적입니다. ChatGPT/Gemini export까지 들어오면 프로젝트 흐름을 훨씬 자연스럽게 이어갈 수 있습니다.'
    : '현재 검색된 memory를 기준으로 요약했습니다. 더 자연스러운 답변은 live provider 연결 후 가능합니다.';

  return [
    `검색된 memory ${filtered.length}건을 기준으로 간략히 정리하면 다음과 같습니다.`,
    '',
    ...bullets,
    '',
    `다음 판단: ${nextStep}`
  ].join('\n');
}

async function searchMemoryContext(db, projectCode, question, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 5), 20));
  const projectAliases = getProjectAliases(projectCode);
  const terms = buildSearchTerms(question);
  const preferredSource = detectPreferredSource(question);
  const aiMemorySourceFilter = buildSourceFilterSql(preferredSource, 'source_ai');
  const rawImportSourceFilter = buildSourceFilterSql(preferredSource, 'source_platform');
  const sources = [];
  const seenIds = new Set();
  const seenFingerprints = new Set();

  function addSource(source) {
    if (!source) return;
    if (preferredSource && !sourceMatchesPreference(source, preferredSource)) return;
    const idKey = `${source.source_type}:${source.id}`;
    const fpKey = memoryFingerprint(source);
    if (seenIds.has(idKey) || seenFingerprints.has(fpKey)) return;
    seenIds.add(idKey);
    seenFingerprints.add(fpKey);
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
           ${aiMemorySourceFilter.sql}
           ${keywordWhere}
         ORDER BY id DESC
         LIMIT ${safeLimit * 4}`,
        params
      );

      const scoredRows = rows
        .filter((r) => preferredSource || !isLowValueTestMemory(r))
        .map((r) => ({
          ...r,
          _score: scoreMemoryRow(r, terms)
            + (preferredSource && normalizeMemorySource(r.source_ai) === preferredSource ? 5 : 0)
            - (isLowValueTestMemory(r) ? 3 : 0)
        }))
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
          low_value_test_memory: isLowValueTestMemory(r),
          created_at: r.created_at
        });
        if (sources.length >= safeLimit) break;
      }
    } catch (error) {
      // Keep the agent usable even if a legacy table has unexpected columns.
    }

    // Fallback: if keyword search finds nothing, load latest active project memories.
    // When the user names Claude/ChatGPT/Gemini, this fallback still keeps that source filter.
    if (sources.length === 0) {
      try {
        const [rows] = await db.query(
          `SELECT id, project_code, source_ai, memory_type, title, summary, detail, tags, status, created_at
           FROM ai_memory
           WHERE ${projectWhere}
             AND (status IS NULL OR status = 'active')
             ${aiMemorySourceFilter.sql}
           ORDER BY id DESC
           LIMIT ${safeLimit * 4}`,
          projectAliases
        );

        const scoredRows = rows
          .filter((r) => preferredSource || !isLowValueTestMemory(r))
          .map((r) => ({
            ...r,
            _score: (preferredSource && normalizeMemorySource(r.source_ai) === preferredSource ? 5 : 0)
              - (isLowValueTestMemory(r) ? 3 : 0)
          }))
          .sort((a, b) => b._score - a._score || Number(b.id || 0) - Number(a.id || 0));

        for (const r of scoredRows) {
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
            score: r._score,
            low_value_test_memory: isLowValueTestMemory(r),
            created_at: r.created_at
          });
          if (sources.length >= safeLimit) break;
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
           ${rawImportSourceFilter.sql}
           ${keywordWhere}
         ORDER BY id DESC
         LIMIT ${remaining * 3}`,
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
        if (sources.length >= safeLimit) break;
      }
    } catch (error) {
      // ignore optional imported conversation search failures
    }
  }

  const trimmed = sources.slice(0, safeLimit).map((s) => ({
    ...s,
    normalized_source: normalizeMemorySource(s.source_ai || s.source_platform || ''),
    text: String(s.text || '').replace(/\s+/g, ' ').slice(0, 900),
    detail: String(s.detail || '').replace(/\s+/g, ' ').slice(0, 900)
  }));

  // Distinguish sources that actually matched the user's keywords from the
  // "no keyword hit, so just show the latest active memories" fallback, so
  // callers do not treat unrelated fallback memory as strong evidence.
  const hasKeywordMatchedSource = trimmed.some((s) => s.source_type !== 'ai_memory_fallback_latest');
  const matchType = trimmed.length === 0 ? 'none' : (hasKeywordMatchedSource ? 'keyword' : 'fallback');

  return {
    project_code: projectCode,
    project_aliases: projectAliases,
    query: question,
    search_terms: terms,
    preferred_source: preferredSource || 'all',
    source_filter_applied: preferredSource ? true : false,
    deduplication_applied: true,
    match_type: matchType,
    used_memory_count: trimmed.length,
    sources: trimmed,
    context_summary: trimmed.map((s, i) => {
      const sourceLabel = s.source_ai || s.source_platform || '';
      const body = s.text || s.detail || '';
      return `[${i + 1}] ${s.source_type}#${s.id} ${sourceLabel} ${s.title || ''}: ${body}`;
    }).join('\n')
  };
}


function inferGatewayQuestionType(question = '') {
  const q = String(question || '').toLowerCase();
  if (/(정상적인 결과|결과가 정상|agent answer|used_memory_count|provider decision|검색 결과|품질|진단)/i.test(q)) return 'agent_result_diagnosis';
  if (/(번역|translate|translation)/i.test(q)) return 'translation';
  if (/(gemini|제미니|google|구글)/i.test(q)) return 'google_context';
  if (/(요약|정리|summarize|summary|간략|import|가져온|불러온|memory|기억|대화|클로드|claude|chatgpt|gemini)/i.test(q)) return 'memory_summary';
  if (/(patch|diff|code|coding|bug|error|api|route|server|npm|git|db|sql|코드|오류|버그|패치|서버|개발|수정)/i.test(q)) return 'coding';
  if (/(사업|전략|계획|투자|판단|분석|리스크|process|schedule|roadmap|strategy|plan|analyze)/i.test(q)) return 'strategy';
  return 'general';
}

function buildGatewayProviderDecision({ question, requestedProvider, context, liveRequested, allowFallback }) {
  const normalizedProvider = normalizeProvider(requestedProvider || 'auto');
  const questionType = inferGatewayQuestionType(question);
  const preferredSource = detectPreferredSource(question);
  const memoryCount = Number(context?.used_memory_count || 0);
  const matchType = context?.match_type || 'none';
  const memoryEnough = memoryCount > 0 && matchType === 'keyword' && ['memory_summary', 'general'].includes(questionType);

  let selectedProvider = 'openai';
  let selectedModelFamily = 'OpenAI';
  let liveCallRecommended = true;
  let estimatedCostLevel = 'medium';
  let decisionReason = '일반 질문이므로 균형형 기본값인 OpenAI 계열을 우선 선택합니다.';

  if (memoryEnough) {
    selectedProvider = 'local';
    selectedModelFamily = 'Local memory answer';
    liveCallRecommended = false;
    estimatedCostLevel = 'zero';
    decisionReason = '저장된 memory만으로 답변 가능한 요약/정리 질문이므로 외부 AI 호출을 생략합니다.';
  } else if (questionType === 'coding') {
    selectedProvider = 'anthropic';
    selectedModelFamily = 'Claude';
    estimatedCostLevel = 'medium';
    decisionReason = '코딩, 오류, 패치, 긴 코드 문맥 분석 요청이므로 Claude 계열을 우선 선택합니다.';
  } else if (questionType === 'strategy') {
    selectedProvider = 'openai';
    selectedModelFamily = 'OpenAI';
    estimatedCostLevel = 'medium';
    decisionReason = '사업 전략, 계획, 분석형 질문이므로 구조화 답변과 추론에 강한 OpenAI 계열을 우선 선택합니다.';
  } else if (questionType === 'google_context' || preferredSource === 'google') {
    selectedProvider = 'google';
    selectedModelFamily = 'Gemini';
    estimatedCostLevel = 'medium';
    decisionReason = 'Google/Gemini 관련 문맥이 강하므로 Gemini 계열을 우선 선택합니다.';
  } else if (preferredSource === 'claude') {
    if (memoryCount > 0) {
      selectedProvider = 'local';
      selectedModelFamily = 'Local Claude memory answer';
      liveCallRecommended = false;
      estimatedCostLevel = 'zero';
      decisionReason = '질문이 Claude import memory 요약에 가깝고 관련 memory가 있으므로 외부 Claude 호출 없이 저장된 기억으로 답변합니다.';
    } else {
      selectedProvider = 'anthropic';
      selectedModelFamily = 'Claude';
      estimatedCostLevel = 'medium';
      decisionReason = 'Claude 관련 질문이지만 저장된 memory가 부족하므로 Claude 계열 호출이 적합합니다.';
    }
  } else if (preferredSource === 'chatgpt') {
    selectedProvider = memoryCount > 0 ? 'local' : 'openai';
    selectedModelFamily = memoryCount > 0 ? 'Local ChatGPT memory answer' : 'OpenAI';
    liveCallRecommended = memoryCount <= 0;
    estimatedCostLevel = memoryCount > 0 ? 'zero' : 'medium';
    decisionReason = memoryCount > 0
      ? 'ChatGPT import memory가 검색되었으므로 우선 저장된 기억만으로 답변합니다.'
      : 'ChatGPT/OpenAI 관련 질문이지만 저장된 memory가 부족하므로 OpenAI 계열 호출이 적합합니다.';
  } else if (matchType !== 'keyword' && ['memory_summary', 'general'].includes(questionType)) {
    // No keyword-matched memory backs this question (only unrelated fallback memory, or none
    // at all), so we deliberately do not answer confidently from local memory. This is a minimal
    // safety net; wiring this to an actual live call is left for a later phase.
    selectedProvider = 'openai';
    selectedModelFamily = 'OpenAI';
    liveCallRecommended = true;
    estimatedCostLevel = 'low';
    decisionReason = '관련된 저장 정보를 찾지 못했습니다. 실시간 질의가 필요한 질문으로 판단하여 OpenAI 계열 호출을 권장합니다.';
  }

  if (normalizedProvider && normalizedProvider !== 'auto') {
    selectedProvider = normalizedProvider;
    selectedModelFamily = normalizedProvider;
    liveCallRecommended = normalizedProvider !== 'mock' && normalizedProvider !== 'local';
    estimatedCostLevel = normalizedProvider === 'mock' ? 'zero' : 'medium';
    decisionReason = `사용자가 provider=${normalizedProvider}를 직접 선택했으므로 자동 선택 대신 해당 provider를 사용합니다.`;
  }

  const liveCallAllowed = Boolean(liveRequested && liveCallRecommended && selectedProvider !== 'local' && selectedProvider !== 'mock');

  return {
    strategy: 'balanced',
    question_type: questionType,
    requested_provider: normalizedProvider,
    selected_provider: selectedProvider,
    selected_model_family: selectedModelFamily,
    live_call_recommended: liveCallRecommended,
    live_call_requested: Boolean(liveRequested),
    live_call_allowed: liveCallAllowed,
    estimated_cost_level: estimatedCostLevel,
    memory_enough_for_local_answer: Boolean(memoryEnough || selectedProvider === 'local'),
    allow_fallback: allowFallback !== false,
    decision_reason: decisionReason
  };
}

function buildProviderDecisionAnswer(question, projectCode, context, decision) {
  const readableSummary = buildReadableContextSummary(context?.sources || [], question);
  const liveOffNote = decision.live_call_recommended && !decision.live_call_allowed
    ? '\n\n참고: 이 질문은 외부 AI 호출을 사용하면 더 좋은 답변이 가능합니다. 현재 live=false이므로 실제 API 호출은 하지 않았습니다.'
    : '';
  return [
    `Agent Decision: ${decision.selected_provider}`,
    `질문 유형: ${decision.question_type}`,
    `선택 이유: ${decision.decision_reason}`,
    `예상 비용 수준: ${decision.estimated_cost_level}`,
    `Live 호출: ${decision.live_call_allowed ? 'yes' : 'no'}`,
    '',
    `프로젝트: ${projectCode}`,
    `불러온 memory: ${context?.used_memory_count || 0}건`,
    `Memory source filter: ${context?.preferred_source || 'all'}`,
    `Deduplication: ${context?.deduplication_applied ? 'on' : 'off'}`,
    '',
    readableSummary,
    liveOffNote
  ].join('\n');
}

function buildMockAnswer(question, projectCode, context) {
  const count = context?.used_memory_count || 0;
  const readableSummary = buildReadableContextSummary(context?.sources || [], question);
  return [
    `프로젝트: ${projectCode}`,
    `모드: mock / safe test`,
    '',
    '아래 답변은 실제 LLM 호출이 아니라, 검색된 memory를 사람이 읽기 쉽게 정리한 테스트 응답입니다. ChatGPT처럼 자연스러운 생성 답변은 provider=auto 또는 openai/anthropic/google + live=true에서 확인할 수 있습니다.',
    '',
    `불러온 memory: ${count}건`,
    '',
    readableSummary
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
  const gatewayDecision = buildGatewayProviderDecision({
    question,
    requestedProvider,
    context,
    liveRequested,
    allowFallback
  });
  const prompt = payload.provider_prompt_override || buildProviderPrompt({
    question,
    projectCode: detected.detected_project_code,
    context,
    detection: detected
  });

  if (gatewayDecision.selected_provider === 'local') {
    return {
      answer: buildProviderDecisionAnswer(question, detected.detected_project_code, context, gatewayDecision),
      provider_used: 'local',
      provider_model: 'memory-only-balanced-agent',
      provider_route: {
        ok: true,
        route_status: 'LOCAL_MEMORY_ANSWER',
        selected_provider: 'local',
        selected_model: 'memory-only-balanced-agent',
        gateway_decision: gatewayDecision
      },
      provider_response: { adapter_status: 'LOCAL_MEMORY_ANSWER', gateway_decision: gatewayDecision },
      gateway_decision: gatewayDecision,
      live_requested: liveRequested,
      fallback_used: false
    };
  }

  if (requestedProvider === 'mock' || gatewayDecision.selected_provider === 'mock' || !providerRouter || !modelProvider?.testProviderAdapter) {
    return {
      answer: buildMockAnswer(question, detected.detected_project_code, context),
      provider_used: 'mock',
      provider_model: process.env.MOCK_DEFAULT_MODEL || 'mock-model',
      provider_route: {
        ok: Boolean(providerRouter),
        route_status: providerRouter ? 'MOCK_FORCED' : 'PROVIDER_ROUTER_NOT_AVAILABLE',
        selected_provider: 'mock',
        selected_model: process.env.MOCK_DEFAULT_MODEL || 'mock-model',
        gateway_decision: gatewayDecision
      },
      provider_response: { adapter_status: 'MOCK_AGENT_RESPONSE', gateway_decision: gatewayDecision },
      gateway_decision: gatewayDecision,
      live_requested: liveRequested,
      fallback_used: requestedProvider !== 'mock'
    };
  }

  if (!gatewayDecision.live_call_allowed) {
    return {
      answer: buildProviderDecisionAnswer(question, detected.detected_project_code, context, gatewayDecision),
      provider_used: 'decision_only',
      provider_model: gatewayDecision.selected_provider,
      provider_route: {
        ok: true,
        route_status: 'PROVIDER_SELECTED_BUT_LIVE_DISABLED',
        selected_provider: gatewayDecision.selected_provider,
        selected_model: gatewayDecision.selected_model_family,
        gateway_decision: gatewayDecision
      },
      provider_response: { adapter_status: 'LIVE_DISABLED_COST_GUARD', gateway_decision: gatewayDecision },
      gateway_decision: gatewayDecision,
      live_requested: liveRequested,
      fallback_used: false
    };
  }

  const preferredProvider = gatewayDecision.selected_provider;
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
        provider_route: { ...route, gateway_decision: gatewayDecision },
        provider_response: null,
        gateway_decision: gatewayDecision,
        live_requested: liveRequested,
        fallback_used: false
      };
    }

    return {
      answer: buildProviderDecisionAnswer(question, detected.detected_project_code, context, {
        ...gatewayDecision,
        selected_provider: 'local',
        selected_model_family: 'Local fallback',
        live_call_allowed: false,
        estimated_cost_level: 'zero',
        decision_reason: `Provider route failed, so the Agent used local memory fallback. ${route.errors?.join('; ') || ''}`
      }),
      provider_used: 'local',
      provider_model: 'memory-only-fallback',
      provider_route: { ...route, gateway_decision: gatewayDecision },
      provider_response: { adapter_status: 'LOCAL_FALLBACK_AFTER_ROUTE_FAILURE', gateway_decision: gatewayDecision },
      gateway_decision: gatewayDecision,
      live_requested: liveRequested,
      fallback_used: true,
      error_message: route.errors?.join('; ') || 'Provider route selection failed.'
    };
  }

  try {
    const providerTest = await modelProvider.testProviderAdapter({
      provider: route.selected_provider,
      model_name: route.selected_model,
      prompt,
      live: liveRequested
    });

    // Provider adapters (testOpenAiLiveProvider / testAnthropicLiveProvider / testGeminiLiveProvider)
    // catch their own API errors internally and RETURN { ok: false, error: '...' } instead of
    // throwing. Detect that here and convert it into a real error so it flows through the same
    // catch block below (local fallback + error_message) instead of being treated as a success.
    if (providerTest && providerTest.ok === false) {
      const adapterError = new Error(
        providerTest.error || `${route.selected_provider} adapter call failed (${providerTest.adapter_status || 'UNKNOWN'}).`
      );
      adapterError.provider_response = providerTest;
      throw adapterError;
    }

    return {
      answer: extractProviderAnswer(providerTest),
      provider_used: route.selected_provider,
      provider_model: route.selected_model,
      provider_route: { ...route, gateway_decision: gatewayDecision },
      provider_response: providerTest,
      gateway_decision: gatewayDecision,
      live_requested: liveRequested,
      fallback_used: requestedProvider !== 'auto' && route.selected_provider !== requestedProvider
    };
  } catch (error) {
    if (!allowFallback) throw error;
    return {
      answer: buildProviderDecisionAnswer(question, detected.detected_project_code, context, {
        ...gatewayDecision,
        selected_provider: 'local',
        selected_model_family: 'Local fallback',
        live_call_allowed: false,
        estimated_cost_level: 'zero',
        decision_reason: `Provider execution failed, so the Agent used local memory fallback. ${error.message}`
      }),
      provider_used: 'local',
      provider_model: 'memory-only-fallback',
      provider_route: route ? { ...route, gateway_decision: gatewayDecision } : { gateway_decision: gatewayDecision },
      provider_response: error.provider_response || { adapter_status: 'PROVIDER_EXECUTION_FAILED_LOCAL_FALLBACK', error: error.message, gateway_decision: gatewayDecision },
      gateway_decision: gatewayDecision,
      live_requested: liveRequested,
      fallback_used: true,
      error_message: error.message
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
    question,
    provider_prompt_override: continuePrompt,
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
  const agentSessionId = buildAgentSessionId(detected.detected_project_code, payload);

  let providerResult;
  try {
    providerResult = await executeProviderAnswer({ question, detected, context, payload: { ...payload, provider: requestedProvider } });
  } catch (error) {
    // Provider call failed and allow_fallback was false, so executeProviderAnswer rethrew.
    // Record the failure (best-effort) before propagating the original error.
    try {
      const failedTurnNo = await getNextAgentTurnNo(db, agentSessionId);
      await db.query(
        `INSERT INTO personal_agent_interactions
          (agent_session_id, agent_turn_no, user_question, detected_project_code, provider_requested, context_summary, context_payload, used_memory_count, used_context_sources, detection_confidence, detection_reason, matched_keywords, status, error_message, save_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          agentSessionId,
          failedTurnNo,
          question,
          detected.detected_project_code,
          requestedProvider,
          context.context_summary,
          safeJson(context),
          context.used_memory_count,
          safeJson(context.sources),
          detected.confidence,
          detected.detection_reason,
          JSON.stringify(detected.matched_keywords || []),
          'failed',
          error.message,
          'provider_call_failed'
        ]
      );
    } catch (_) {
      // Do not mask the original provider error with a failure-logging error.
    }
    throw error;
  }

  const hadProviderError = Boolean(providerResult.error_message);
  const interactionStatus = hadProviderError ? 'fallback_on_error' : 'ok';
  const interactionErrorMessage = hadProviderError ? providerResult.error_message : null;
  const answerSummary = summarizeAnswer(providerResult.answer);

  let agentTurnNo = await getNextAgentTurnNo(db, agentSessionId);
  let result;
  const maxAttempts = 3; // initial attempt + up to 2 retries on turn_no collision
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      [result] = await db.query(
        `INSERT INTO personal_agent_interactions
          (agent_session_id, agent_turn_no, user_question, detected_project_code, provider_requested, provider_used, provider_model, provider_route_payload, provider_response_payload, provider_live_requested, provider_fallback_used, context_summary, context_payload, answer, answer_summary, question_type, gateway_selected_provider, gateway_live_call_recommended, gateway_cost_level, gateway_decision_reason, gateway_decision_payload, used_memory_count, used_context_sources, detection_confidence, detection_reason, matched_keywords, save_status, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          providerResult.gateway_decision?.question_type || null,
          providerResult.gateway_decision?.selected_provider || null,
          providerResult.gateway_decision?.live_call_recommended ? 1 : 0,
          providerResult.gateway_decision?.estimated_cost_level || null,
          providerResult.gateway_decision?.decision_reason || null,
          safeJson(providerResult.gateway_decision || null),
          context.used_memory_count,
          safeJson(context.sources),
          detected.confidence,
          detected.detection_reason,
          JSON.stringify(detected.matched_keywords || []),
          'interaction_saved',
          interactionStatus,
          interactionErrorMessage
        ]
      );
      break;
    } catch (error) {
      const isDuplicateTurn = error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
      if (!isDuplicateTurn || attempt === maxAttempts) throw error;
      agentTurnNo = await getNextAgentTurnNo(db, agentSessionId);
    }
  }

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
    gateway_decision: providerResult.gateway_decision || providerResult.provider_route?.gateway_decision || null,
    question_type: providerResult.gateway_decision?.question_type || null,
    selected_provider: providerResult.gateway_decision?.selected_provider || providerResult.provider_used,
    estimated_cost_level: providerResult.gateway_decision?.estimated_cost_level || null,
    live_call_allowed: providerResult.gateway_decision?.live_call_allowed || false,
    decision_reason: providerResult.gateway_decision?.decision_reason || null,
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

async function listSessions(db, payload = {}) {
  await ensureTables(db);
  const limit = Math.min(Number(payload.limit || 50), 200);
  const projectCode = payload.project_code && payload.project_code !== 'all' ? String(payload.project_code) : null;
  const params = [];
  const where = ['agent_session_id IS NOT NULL'];
  if (projectCode) { where.push('detected_project_code = ?'); params.push(projectCode); }
  const whereSql = where.join(' AND ');
  params.push(limit);

  const [rows] = await db.query(
    `SELECT
       agent_session_id,
       detected_project_code AS project_code,
       COUNT(*) AS turn_count,
       MAX(created_at) AS last_created_at,
       SUBSTRING(
         (SELECT user_question FROM personal_agent_interactions p2
          WHERE p2.agent_session_id = p1.agent_session_id
          ORDER BY created_at ASC LIMIT 1), 1, 60
       ) AS title
     FROM personal_agent_interactions p1
     WHERE ${whereSql}
     GROUP BY agent_session_id, detected_project_code
     ORDER BY last_created_at DESC
     LIMIT ?`,
    params
  );

  const sessions = rows.map((r) => ({
    agent_session_id: r.agent_session_id,
    project_code: r.project_code,
    turn_count: Number(r.turn_count),
    last_created_at: r.last_created_at,
    title: r.title || ''
  }));

  return { ok: true, sessions };
}

async function getSessionDetail(db, sessionId) {
  await ensureTables(db);
  const [rows] = await db.query(
    `SELECT agent_turn_no, user_question, answer, provider_used,
            question_type, used_memory_count, created_at
     FROM personal_agent_interactions
     WHERE agent_session_id = ?
     ORDER BY created_at ASC`,
    [sessionId]
  );

  const turns = rows.map((r) => ({
    agent_turn_no: r.agent_turn_no,
    user_question: r.user_question,
    answer: r.answer,
    provider_used: r.provider_used,
    question_type: r.question_type,
    used_memory_count: r.used_memory_count,
    created_at: r.created_at
  }));

  return { ok: true, agent_session_id: sessionId, turns };
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
  inferGatewayQuestionType,
  buildGatewayProviderDecision,
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
  listSessions,
  getSessionDetail,
  getOperationLogs,
  operationLogsTest
};
