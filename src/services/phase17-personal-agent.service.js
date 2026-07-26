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

let crmTools = null;

try {
  crmTools = require('./crm-tools.service');
} catch (error) {
  crmTools = null;
}

let githubTools = null;

try {
  githubTools = require('./github-tools.service');
} catch (error) {
  githubTools = null;
}

let pendingActionsService = null;

try {
  pendingActionsService = require('./pending-actions.service');
} catch (error) {
  pendingActionsService = null;
}

// Phase 5-2/5-8: opt-in Anthropic tool-use. Under an explicit provider it's gated by
// payload.enable_crm_tool; under provider=auto it's gated instead by the gateway's own
// crm_query classification (see buildGatewayProviderDecision / executeProviderAnswer).
const CRM_TOOLS = [
  {
    name: 'search_listings',
    description: 'RBS-HOMES CRM에 등록된 매물을 검색합니다. 이름/주소 키워드 검색 또는 정확한 코드 조회 가능하며, 거래유형(RENT/SALE), 가격 범위로 필터링할 수 있습니다. 응답의 total_matching_count는 조건에 맞는 전체 매물 개수이고, listings 배열은 그중 최대 20개만 보여준 목록입니다. 개수를 답할 때는 반드시 total_matching_count를 사용하고, listings.length를 전체 개수로 착각하지 마세요.',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '건물명 또는 주소에 포함된 검색어 (예: BGC, Maridien)' },
        code: { type: 'string', description: '정확한 매물 코드로 조회할 때 사용, 예: L-2607-d861' },
        transaction_type: { type: 'string', enum: ['RENT', 'SALE'], description: '거래 유형' },
        min_price: { type: 'number', description: '최소 가격' },
        max_price: { type: 'number', description: '최대 가격' }
      },
      required: []
    }
  }
];

// Phase 5-6/5-8: opt-in Anthropic tool-use. Under an explicit provider it's gated by
// payload.enable_github_tool; under provider=auto it's gated instead by the gateway's own
// dev_activity classification (see buildGatewayProviderDecision / executeProviderAnswer).
// Read-only - returns commit metadata (message/author/date/short sha) only, never diffs or file
// content.
const GITHUB_TOOLS = [
  {
    name: 'get_recent_commits',
    description: 'GitHub 저장소(ai-memory-gateway, ai-assistant-console)의 최근 커밋 목록을 조회합니다. 커밋 메시지/작성자/날짜/짧은 sha만 반환하며 diff나 파일 내용은 가져오지 않습니다.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', enum: ['ai-memory-gateway', 'ai-assistant-console'], description: '조회할 GitHub 저장소' },
        limit: { type: 'number', description: '가져올 커밋 개수 (기본 5, 최대 20)' }
      },
      required: ['repo']
    }
  }
];

// Phase 6-4: opt-in write-proposal tool-use, gated by payload.enable_write_proposals
// (explicit opt-in only, no gateway-auto path yet). Calling this tool never touches GitHub -
// it only inserts a 'pending' row into pending_actions for a human to approve/reject later
// via GET/POST /ai/agent/actions.
const WRITE_PROPOSAL_TOOLS = [
  {
    name: 'propose_github_issue',
    description: 'GitHub 이슈 생성을 제안합니다. 실제로 생성하지 않고 승인 대기 상태로 등록만 합니다.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: '이슈를 생성할 저장소 (예: ai-memory-gateway)' },
        title: { type: 'string', description: '이슈 제목' },
        body: { type: 'string', description: '이슈 본문' },
        labels: { type: 'array', items: { type: 'string' }, description: '적용할 라벨 목록 (선택)' }
      },
      required: ['repo', 'title', 'body']
    }
  }
];

// Maps a tool_use block's `name` to the read-only handler that executes it. Handlers take
// (input, toolContext) - toolContext is only populated/used by write-proposal tools that need
// db/session identity; the read-only CRM/GitHub handlers ignore the second argument.
const TOOL_HANDLERS = {
  search_listings: (input) => crmTools.searchListings(input || {}),
  get_recent_commits: (input) => githubTools.getRecentCommits(input || {}),
  propose_github_issue: (input, toolContext = {}) => pendingActionsService.proposeAction(toolContext.db, {
    project_code: toolContext.projectCode,
    agent_session_id: toolContext.agentSessionId,
    action_type: 'github_issue_create',
    payload: input || {},
    proposed_by: 'gateway_auto'
  })
};

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
  if (['lmstudio', 'lm-studio', 'lm studio'].includes(v)) return 'lmstudio';
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

  // Phase 6-1: fixed per-project guidelines that are always injected into the agent prompt,
  // independent of whatever memory the keyword search happens to find. A project can have many
  // guidelines (e.g. "매물 등록 규칙", "고객 응대 톤"), so this is not unique-per-project_code
  // the way personal_agent_project_rules is.
  await db.query(`
    CREATE TABLE IF NOT EXISTS project_guidelines (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_code VARCHAR(100) NOT NULL,
      title VARCHAR(255) NULL,
      content TEXT NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_project_active (project_code, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Phase 7-1: one row per writer/critic turn in a runWriterCriticLoop() run. round_no is
  // shared between the writer and critic row of the same exchange - role distinguishes them.
  await db.query(`
    CREATE TABLE IF NOT EXISTS collab_rounds (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      collab_session_id VARCHAR(180) NOT NULL,
      project_code VARCHAR(100) NULL,
      round_no INT NOT NULL,
      role VARCHAR(20) NOT NULL,
      provider_used VARCHAR(50) NULL,
      content LONGTEXT NULL,
      verdict VARCHAR(20) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_collab_session (collab_session_id, round_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  // Phase 7-2: optional reasoning/thinking trace behind the final content - LM Studio's
  // reasoning-capable local models expose this as message.reasoning_content; Anthropic
  // generally won't have one unless extended thinking is enabled. Nullable, so existing rows
  // and providers without a reasoning trace are unaffected.
  await ensureColumn(db, 'collab_rounds', 'reasoning_content', 'LONGTEXT NULL AFTER content');
}

// Phase 6-1: returns every active guideline for a project, merged into one text block so
// callers (buildProviderPrompt) can drop it straight into the prompt as a single section.
async function getActiveGuidelines(db, projectCode) {
  if (!(await tableExists(db, 'project_guidelines'))) return '';
  const [rows] = await db.query(
    `SELECT title, content
     FROM project_guidelines
     WHERE project_code = ? AND is_active = 1
     ORDER BY id ASC`,
    [projectCode]
  );
  if (!rows.length) return '';
  return rows.map((r) => (r.title ? `[${r.title}]\n${r.content}` : r.content)).join('\n\n');
}

async function addProjectGuideline(db, { project_code, title, content }) {
  await ensureTables(db);
  const projectCode = String(project_code || '').trim();
  const guidelineContent = String(content || '').trim();
  if (!projectCode) throw new Error('project_code is required');
  if (!guidelineContent) throw new Error('content is required');

  const [result] = await db.query(
    `INSERT INTO project_guidelines (project_code, title, content, is_active)
     VALUES (?, ?, ?, 1)`,
    [projectCode, title ? String(title).trim() : null, guidelineContent]
  );
  return { id: result.insertId, project_code: projectCode, title: title || null, content: guidelineContent, is_active: 1 };
}

async function listProjectGuidelines(db, projectCode) {
  await ensureTables(db);
  const params = [];
  let whereSql = '';
  if (projectCode) {
    whereSql = 'WHERE project_code = ?';
    params.push(projectCode);
  }
  const [rows] = await db.query(
    `SELECT id, project_code, title, content, is_active, created_at, updated_at
     FROM project_guidelines
     ${whereSql}
     ORDER BY project_code ASC, id ASC`,
    params
  );
  return rows;
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

const PROJECT_CODE_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Phase 6-3: lets a project be registered via API instead of editing DEFAULT_PROJECTS in code.
// detectProject() already reads personal_agent_project_rules from the DB on every call (see
// below), so a newly added row is picked up immediately with no restart required.
async function addProjectRule(db, { project_code, label, keywords }) {
  await ensureTables(db);
  const projectCode = String(project_code || '').trim();
  if (!PROJECT_CODE_PATTERN.test(projectCode)) {
    throw new Error('project_code must contain only letters, digits, and underscores, and cannot start with a digit');
  }

  const [existing] = await db.query('SELECT id FROM personal_agent_project_rules WHERE project_code = ?', [projectCode]);
  if (existing.length) {
    throw new Error(`project_code "${projectCode}" already exists`);
  }

  const keywordList = Array.isArray(keywords) ? keywords.map((k) => String(k)) : [];
  const [result] = await db.query(
    `INSERT INTO personal_agent_project_rules (project_code, label, keywords, is_active)
     VALUES (?, ?, ?, 1)`,
    [projectCode, label ? String(label).trim() : projectCode, JSON.stringify(keywordList)]
  );
  return { id: result.insertId, project_code: projectCode, label: label ? String(label).trim() : projectCode, keywords: keywordList, is_active: 1 };
}

async function updateProjectRule(db, projectCode, { label, keywords }) {
  await ensureTables(db);
  const code = String(projectCode || '').trim();
  const [existing] = await db.query(
    'SELECT id, label, keywords FROM personal_agent_project_rules WHERE project_code = ?',
    [code]
  );
  if (!existing.length) throw new Error(`project_code "${code}" not found`);

  const nextLabel = label !== undefined ? String(label).trim() : existing[0].label;
  const nextKeywords = Array.isArray(keywords)
    ? keywords.map((k) => String(k))
    : (() => { try { return JSON.parse(existing[0].keywords || '[]'); } catch (_) { return []; } })();

  await db.query(
    'UPDATE personal_agent_project_rules SET label = ?, keywords = ? WHERE project_code = ?',
    [nextLabel, JSON.stringify(nextKeywords), code]
  );
  return { project_code: code, label: nextLabel, keywords: nextKeywords };
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
    .filter((t) => !['the', 'and', 'for', 'with', 'from', 'this', 'that', 'about', 'into', 'your', 'you', 'are', 'was', 'were', '내용', '관련', '이어서', '설명해주세요', '프로젝트', '뭐가', '있는지', '알려줘', '해줘', '어떻게'].includes(t));

  const unique = [];
  for (const token of tokens) {
    if (!unique.includes(token)) unique.push(token);
    if (unique.length >= 8) break;
  }

  return unique.length ? unique : raw ? [raw.slice(0, 80)] : [];
}

// Guards against a term being glued to *other* word characters as a prefix, e.g. "rbs" no
// longer matches inside the unrelated identifier "rbs_viber", and "록" no longer matches as a
// bare fragment inside "등록". The trailing edge is only checked for pure ASCII terms (Latin
// letters/digits/underscore): Korean regularly attaches particles and verb/copula endings
// directly onto a word with no space (e.g. "요약" + "입니다", "등록" + "했다"), so requiring a
// non-Hangul character right after a Hangul term would reject perfectly ordinary matches. This
// is not a real morphological analyzer - it only filters out the clearest false hits, and relies
// on the minimum-match-score threshold (see MIN_KEYWORD_MATCH_SCORE) to catch same-word-wrong-topic
// coincidences that no boundary rule can distinguish (e.g. "등록" used in an unrelated sentence).
function buildWordBoundaryPattern(term) {
  const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isAsciiTerm = /^[a-z0-9_]+$/i.test(term);
  const boundaryClass = '[a-z0-9_가-힣]';
  const trailingGuard = isAsciiTerm ? `(?!${boundaryClass})` : '';
  return new RegExp(`(?<!${boundaryClass})${escaped}${trailingGuard}`, 'i');
}

function scoreMemoryRow(row, terms = []) {
  const haystack = [row.title, row.summary, row.detail, row.tags, row.source_ai]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  let score = 0;
  for (const term of terms) {
    if (term && buildWordBoundaryPattern(term).test(haystack)) score += 1;
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
  // callers do not treat unrelated fallback memory as strong evidence. A single
  // low-scoring match (e.g. one short, common term) is not treated as reliable
  // evidence either - ai_memory sources need a score high enough to reflect at
  // least two matched terms (or one term plus both source/status bonuses).
  const MIN_KEYWORD_MATCH_SCORE = 2;
  const isReliableKeywordMatch = (s) => {
    if (s.source_type === 'ai_memory_fallback_latest') return false;
    if (s.source_type === 'ai_memory') return Number(s.score || 0) >= MIN_KEYWORD_MATCH_SCORE;
    return true;
  };
  const hasKeywordMatchedSource = trimmed.some(isReliableKeywordMatch);
  const matchType = trimmed.length === 0 ? 'none' : (hasKeywordMatchedSource ? 'keyword' : 'fallback');

  // Phase 6-1: fixed project guidelines are unrelated to the keyword search above - they are
  // always pulled in for the project, regardless of whether any memory matched this question.
  const guidelinesText = await getActiveGuidelines(db, projectCode);

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
    guidelines_text: guidelinesText,
    context_summary: trimmed.map((s, i) => {
      const sourceLabel = s.source_ai || s.source_platform || '';
      const body = s.text || s.detail || '';
      return `[${i + 1}] ${s.source_type}#${s.id} ${sourceLabel} ${s.title || ''}: ${body}`;
    }).join('\n')
  };
}


// crm_query / dev_activity terms are matched with buildWordBoundaryPattern (same helper used by
// scoreMemoryRow) instead of a bare substring regex, so short terms like "github" or "listing"
// don't accidentally fire inside unrelated identifiers.
const CRM_QUERY_TERMS = ['매물', '부동산', '임대', '매매', '시세', '중개', 'listing', 'property', 'bgc', '콘도'];
const DEV_ACTIVITY_TERMS = ['커밋', '배포', '작업내역', '개발현황', 'github', '깃허브', 'repository'];
const DEV_ACTIVITY_PHRASE_PATTERN = /최근.*작업/i;

function matchesAnyBoundaryTerm(text, terms) {
  return terms.some((term) => buildWordBoundaryPattern(term).test(text));
}

function inferGatewayQuestionType(question = '') {
  const q = String(question || '').toLowerCase();
  if (/(정상적인 결과|결과가 정상|agent answer|used_memory_count|provider decision|검색 결과|품질|진단)/i.test(q)) return 'agent_result_diagnosis';
  if (/(번역|translate|translation)/i.test(q)) return 'translation';
  if (/(gemini|제미니|google|구글)/i.test(q)) return 'google_context';
  // dev_activity is checked before memory_summary: memory_summary's own keyword list includes
  // bare "memory" (no word boundary), which would otherwise swallow repo-name mentions like
  // "ai-memory-gateway에서 최근 작업 내역 알려줘" that are really asking for commit/activity
  // history, not a memory recap. It's also checked before coding for the same reason - coding's
  // keyword list includes bare "개발", which would otherwise swallow "개발현황"-style phrases.
  if (matchesAnyBoundaryTerm(q, DEV_ACTIVITY_TERMS) || DEV_ACTIVITY_PHRASE_PATTERN.test(q)) return 'dev_activity';
  if (/(요약|정리|summarize|summary|간략|import|가져온|불러온|memory|기억|대화|클로드|claude|chatgpt|gemini)/i.test(q)) return 'memory_summary';
  if (/(patch|diff|code|coding|bug|error|api|route|server|npm|git|db|sql|코드|오류|버그|패치|서버|개발|수정)/i.test(q)) return 'coding';
  // crm_query is checked after coding: a sentence like "매물 등록 코드 수정해줘" mentions a CRM
  // term ("매물") but is really a code-edit request, so an explicit coding intent should win.
  if (matchesAnyBoundaryTerm(q, CRM_QUERY_TERMS)) return 'crm_query';
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
  let autoEnableCrmTool = false;
  let autoEnableGithubTool = false;

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
  } else if (questionType === 'crm_query') {
    selectedProvider = 'anthropic';
    selectedModelFamily = 'Claude';
    estimatedCostLevel = 'medium';
    autoEnableCrmTool = true;
    decisionReason = '부동산 관련 질문으로 판단되어 CRM 조회 도구를 자동 활성화합니다.';
  } else if (questionType === 'dev_activity') {
    selectedProvider = 'anthropic';
    selectedModelFamily = 'Claude';
    estimatedCostLevel = 'medium';
    autoEnableGithubTool = true;
    decisionReason = '개발 작업/커밋 이력 관련 질문으로 판단되어 GitHub 조회 도구를 자동 활성화합니다.';
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
    if (memoryCount > 0 && matchType === 'keyword') {
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
    const chatgptMemoryReliable = memoryCount > 0 && matchType === 'keyword';
    selectedProvider = chatgptMemoryReliable ? 'local' : 'openai';
    selectedModelFamily = chatgptMemoryReliable ? 'Local ChatGPT memory answer' : 'OpenAI';
    liveCallRecommended = !chatgptMemoryReliable;
    estimatedCostLevel = chatgptMemoryReliable ? 'zero' : 'medium';
    decisionReason = chatgptMemoryReliable
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
    // Auto tool-enabling is a provider=auto-only behavior. When the caller pins a provider
    // explicitly, tool access reverts to the existing manual enable_crm_tool/enable_github_tool
    // checkboxes (see executeProviderAnswer) so there is no regression for that flow.
    autoEnableCrmTool = false;
    autoEnableGithubTool = false;
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
    decision_reason: decisionReason,
    auto_enable_crm_tool: autoEnableCrmTool,
    auto_enable_github_tool: autoEnableGithubTool
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
  // Guidelines are a fixed, always-applied section, distinct from the searched memory below -
  // they don't depend on this question's keywords, so a project with none skips the section
  // entirely rather than emitting an empty header.
  const guidelinesSection = context?.guidelines_text
    ? ['=== 프로젝트 지침 (항상 적용) ===', context.guidelines_text, '']
    : [];

  return [
    'You are the user\'s Personal AI Gateway Agent.',
    'Answer in Korean unless the user explicitly asks for another language.',
    'Use the memory context below as the continuity source of truth.',
    'Do not claim that context exists if it is not shown.',
    'If a "프로젝트 지침" section is present, always follow it - it takes priority over the searched memory context.',
    '',
    `Detected project_code: ${projectCode}`,
    `Detection reason: ${detection?.detection_reason || ''}`,
    `Loaded memory count: ${context?.used_memory_count || 0}`,
    '',
    ...guidelinesSection,
    '=== 관련 참고 자료 ===',
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

// Phase 5-2/5-6: runs a single-round-trip tool-use loop against Anthropic for whichever
// tools are opt-in for this request (payload.enable_crm_tool / payload.enable_github_tool).
// Only called when the resolved provider is anthropic (see executeProviderAnswer). Not part
// of the automatic gateway decision - this is an explicit opt-in per request.
async function runAnthropicWithTools({ prompt, route, liveRequested, tools, toolContext }) {
  const firstCall = await modelProvider.testProviderAdapter({
    provider: route.selected_provider,
    model_name: route.selected_model,
    prompt,
    live: liveRequested,
    tools
  });

  if (!firstCall || firstCall.ok === false) {
    return { providerTest: firstCall, toolAudit: { tool_used: false } };
  }

  const contentBlocks = firstCall.response?.content_blocks || [];
  const toolNames = tools.map((tool) => tool.name);
  const toolUseBlock = contentBlocks.find((block) => block.type === 'tool_use' && toolNames.includes(block.name));

  if (firstCall.response?.stop_reason !== 'tool_use' || !toolUseBlock) {
    return { providerTest: firstCall, toolAudit: { tool_used: false } };
  }

  let resultData = null;
  let toolError = null;
  try {
    const handler = TOOL_HANDLERS[toolUseBlock.name];
    if (!handler) throw new Error(`No handler registered for tool "${toolUseBlock.name}"`);
    resultData = await handler(toolUseBlock.input, toolContext || {});
  } catch (error) {
    toolError = error.message;
  }

  const toolResultContent = toolError ? JSON.stringify({ error: toolError }) : JSON.stringify(resultData);

  const followupMessages = [
    { role: 'user', content: prompt },
    { role: 'assistant', content: contentBlocks },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResultContent }] }
  ];

  const secondCall = await modelProvider.testProviderAdapter({
    provider: route.selected_provider,
    model_name: route.selected_model,
    prompt,
    live: liveRequested,
    messages_override: followupMessages
  });

  // Most tools return a bare array (tool_result_count = "how many rows this
  // call returned"). search_listings instead returns { listings,
  // total_matching_count, returned_count } so Claude can tell a limit-capped
  // list apart from the true match count - detect that shape generically
  // (not tied to one tool name) rather than assuming every tool is an array.
  const hasListingsShape = resultData && typeof resultData === 'object' && Array.isArray(resultData.listings);
  const toolResultCount = Array.isArray(resultData)
    ? resultData.length
    : (hasListingsShape ? resultData.listings.length : null);
  const totalMatchingCount = hasListingsShape ? resultData.total_matching_count : null;

  return {
    providerTest: secondCall,
    toolAudit: {
      tool_used: true,
      tool_name: toolUseBlock.name,
      tool_input: toolUseBlock.input,
      tool_result_count: toolResultCount,
      total_matching_count: totalMatchingCount,
      tool_result: resultData,
      tool_error: toolError
    }
  };
}

async function executeProviderAnswer({ question, detected, context, payload, db, agentSessionId }) {
  const requestedProvider = normalizeProvider(payload.provider || 'auto');
  const isAutoProvider = requestedProvider === 'auto';
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
  // provider=auto: tool access is decided entirely by the gateway (auto_enable_crm_tool /
  // auto_enable_github_tool from the question-type classification), ignoring whatever the
  // caller passed in enable_crm_tool/enable_github_tool. provider=anthropic/openai/google/
  // lmstudio (explicit): unchanged manual opt-in via those same payload flags. live=false never
  // reaches a live call at all (see the live_call_allowed guard below), so this can't affect the
  // free memory-only answer path.
  const autoCrmTool = isAutoProvider && liveRequested && Boolean(gatewayDecision.auto_enable_crm_tool);
  const autoGithubTool = isAutoProvider && liveRequested && Boolean(gatewayDecision.auto_enable_github_tool);
  const enableCrmTool = isAutoProvider ? autoCrmTool : isTruthy(payload.enable_crm_tool);
  const enableGithubTool = isAutoProvider ? autoGithubTool : isTruthy(payload.enable_github_tool);
  // Phase 6-4: explicit opt-in only, no gateway-auto path - propose_github_issue never fires
  // unless the caller sets enable_write_proposals, regardless of provider=auto classification.
  const enableWriteProposals = isTruthy(payload.enable_write_proposals);
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
    let providerTest;
    let toolAudit = null;

    const activeTools = [];
    const toolTriggeredByName = {};
    if (enableCrmTool && crmTools) {
      activeTools.push(...CRM_TOOLS);
      toolTriggeredByName.search_listings = autoCrmTool ? 'gateway_auto' : 'user_toggle';
    }
    if (enableGithubTool && githubTools) {
      activeTools.push(...GITHUB_TOOLS);
      toolTriggeredByName.get_recent_commits = autoGithubTool ? 'gateway_auto' : 'user_toggle';
    }
    if (enableWriteProposals && pendingActionsService) {
      activeTools.push(...WRITE_PROPOSAL_TOOLS);
      toolTriggeredByName.propose_github_issue = 'user_toggle';
    }

    if (activeTools.length && route.selected_provider === 'anthropic') {
      const toolRun = await runAnthropicWithTools({
        prompt,
        route,
        liveRequested,
        tools: activeTools,
        toolContext: { db, projectCode: detected.detected_project_code, agentSessionId }
      });
      providerTest = toolRun.providerTest;
      toolAudit = toolRun.toolAudit;
      if (toolAudit?.tool_used) {
        toolAudit.triggered_by = toolTriggeredByName[toolAudit.tool_name] || 'user_toggle';
      }
    } else {
      providerTest = await modelProvider.testProviderAdapter({
        provider: route.selected_provider,
        model_name: route.selected_model,
        prompt,
        live: liveRequested
      });
    }

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
      fallback_used: requestedProvider !== 'auto' && route.selected_provider !== requestedProvider,
      tool_audit: toolAudit
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

// -----------------------------------------------------------------------------
// Phase 7-1: writer(anthropic) <-> critic(lmstudio) multi-round drafting loop.
// callAnthropicLive() and callLmStudioLive() already share the same call shape
// ({ modelProfile, finalPrompt, system_context_text }) and both return { answer, ... }
// directly, so they're called straight rather than through testProviderAdapter -
// that wrapper hard-caps max_output_tokens to 500 for its smoke-test screens, which
// starves LM Studio's reasoning-heavy local model (it can burn 700+ tokens on
// reasoning_content alone before writing the actual answer) and truncates the critic's
// verdict to nothing.
// -----------------------------------------------------------------------------

function buildCriticPrompt({ draft, originalQuestion }) {
  return [
    '당신은 신중하고 꼼꼼한 검토자입니다. 아래 문서를 검토해주세요.',
    '문제가 없으면 응답을 정확히 "APPROVED"로 시작하세요.',
    '문제가 있으면 응답을 정확히 "NEEDS_REVISION"으로 시작한 뒤, 구체적인 지적사항을 목록으로 나열하세요.',
    '사소한 트집이 아니라 실제로 고쳐야 할 문제에만 집중하세요.',
    '',
    `검토 시 반드시 원래 요청('${originalQuestion}')이 요구하는 범위 안에서만 판단하세요.`,
    '요청이 간단한 요약이나 짧은 답변을 원했다면, 완전한 운영 매뉴얼 수준의 완결성을 요구하지 마세요.',
    '요청 범위를 벗어난 추가 제안은 "선택 사항"으로만 언급하고, 그것 때문에 NEEDS_REVISION으로 판정하지 마세요.',
    '',
    '=== 원래 요청 ===',
    originalQuestion,
    '',
    '=== 검토 대상 문서 ===',
    draft
  ].join('\n');
}

function buildWriterRevisionPrompt({ question, previousDraft, feedback }) {
  return [
    '당신은 문서 작성자입니다. 검토자의 피드백을 반영해서 문서를 다시 작성하세요.',
    '설명이나 인사말 없이, 최종 문서 내용만 응답하세요.',
    '',
    '## 원래 요청',
    question,
    '',
    '=== 이전 초안 ===',
    previousDraft,
    '',
    '=== 검토자 피드백 ===',
    feedback
  ].join('\n');
}

function parseCriticVerdict(content) {
  const normalized = String(content || '').trim().toUpperCase();
  if (normalized.startsWith('APPROVED')) return 'approved';
  if (normalized.startsWith('NEEDS_REVISION')) return 'needs_revision';
  // The model didn't follow the exact-prefix instruction - fall back to a substring check
  // on the first line, defaulting to needs_revision so an ambiguous reply never silently
  // short-circuits the loop as if it had been approved.
  const firstLine = normalized.split('\n')[0].slice(0, 50);
  return firstLine.includes('APPROVED') ? 'approved' : 'needs_revision';
}

// Structured multi-section documents (headers, tables, checklists) routinely exceed the
// shared ANTHROPIC_MAX_OUTPUT_TOKENS/LMSTUDIO_MAX_OUTPUT_TOKENS budget (1500 by default,
// sized for normal chat answers), which was silently truncating writer drafts and critic
// verdicts mid-sentence. These give the collab loop its own, larger budget without touching
// the shared env values other callers (e.g. /agent/ask) rely on.
const COLLAB_WRITER_MAX_OUTPUT_TOKENS = Number(process.env.COLLAB_WRITER_MAX_OUTPUT_TOKENS) || 4000;
const COLLAB_CRITIC_MAX_OUTPUT_TOKENS = Number(process.env.COLLAB_CRITIC_MAX_OUTPUT_TOKENS) || 2000;

async function callCollabWriter(prompt) {
  const liveConfig = modelProvider.getAnthropicLiveConfig();
  const modelProfile = modelProvider.normalizeModelProfile({
    model_code: 'collab_writer_anthropic',
    provider: 'anthropic',
    model_name: liveConfig.default_model,
    display_name: 'Collab Writer (Anthropic)',
    max_output_tokens: COLLAB_WRITER_MAX_OUTPUT_TOKENS,
    is_active: true
  });
  return modelProvider.callAnthropicLive({
    modelProfile,
    finalPrompt: prompt,
    max_output_tokens_override: COLLAB_WRITER_MAX_OUTPUT_TOKENS
  });
}

async function callCollabCritic(prompt) {
  const liveConfig = modelProvider.getLmStudioLiveConfig();
  const modelProfile = modelProvider.normalizeModelProfile({
    model_code: 'collab_critic_lmstudio',
    provider: 'lmstudio',
    model_name: liveConfig.default_model,
    display_name: 'Collab Critic (LM Studio)',
    max_output_tokens: COLLAB_CRITIC_MAX_OUTPUT_TOKENS,
    is_active: true
  });
  return modelProvider.callLmStudioLive({
    modelProfile,
    finalPrompt: prompt,
    max_output_tokens_override: COLLAB_CRITIC_MAX_OUTPUT_TOKENS
  });
}

async function insertCollabRound(db, { collabSessionId, projectCode, roundNo, role, providerUsed, content, reasoningContent, verdict }) {
  const [result] = await db.query(
    `INSERT INTO collab_rounds (collab_session_id, project_code, round_no, role, provider_used, content, reasoning_content, verdict)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [collabSessionId, projectCode || null, roundNo, role, providerUsed || null, content || null, reasoningContent || null, verdict || null]
  );

  return {
    id: Number(result.insertId),
    collab_session_id: collabSessionId,
    project_code: projectCode || null,
    round_no: roundNo,
    role,
    provider_used: providerUsed || null,
    content: content || null,
    reasoning_content: reasoningContent || null,
    verdict: verdict || null
  };
}

async function runWriterCriticLoop(db, { question, projectCode, maxRounds = 3 } = {}) {
  if (!modelProvider) throw new Error('model-provider.service is not available.');

  await ensureTables(db);

  const trimmedQuestion = String(question || '').trim();
  if (!trimmedQuestion) throw new Error('question is required');

  const resolvedMaxRounds = Math.max(1, Math.min(Number(maxRounds) || 3, 5));
  const detected = await detectProject(db, trimmedQuestion, projectCode || 'auto');
  const context = await searchMemoryContext(db, detected.detected_project_code, trimmedQuestion, 5);
  const collabSessionId = `collab-${detected.detected_project_code}-${Date.now()}`;

  const rounds = [];
  let writerContent = null;
  let criticContent = null;
  let verdict = null;
  let completedRounds = 0;

  for (let roundNo = 1; roundNo <= resolvedMaxRounds; roundNo += 1) {
    const writerPrompt = roundNo === 1
      ? buildProviderPrompt({ question: trimmedQuestion, projectCode: detected.detected_project_code, context, detection: detected })
      : buildWriterRevisionPrompt({ question: trimmedQuestion, previousDraft: writerContent, feedback: criticContent });

    let writerResponse;
    try {
      writerResponse = await callCollabWriter(writerPrompt);
    } catch (error) {
      throw new Error(`Writer(anthropic) call failed at round ${roundNo}: ${error.message}`);
    }
    writerContent = extractProviderAnswer(writerResponse);
    rounds.push(await insertCollabRound(db, {
      collabSessionId,
      projectCode: detected.detected_project_code,
      roundNo,
      role: 'writer',
      providerUsed: writerResponse.provider || 'anthropic',
      content: writerContent,
      reasoningContent: typeof writerResponse.reasoning_content === 'string' ? writerResponse.reasoning_content : null,
      verdict: null
    }));

    const criticPrompt = buildCriticPrompt({ draft: writerContent, originalQuestion: trimmedQuestion });
    let criticResponse;
    try {
      criticResponse = await callCollabCritic(criticPrompt);
    } catch (error) {
      throw new Error(`Critic(lmstudio) call failed at round ${roundNo}: ${error.message}`);
    }
    criticContent = extractProviderAnswer(criticResponse);
    verdict = parseCriticVerdict(criticContent);
    rounds.push(await insertCollabRound(db, {
      collabSessionId,
      projectCode: detected.detected_project_code,
      roundNo,
      role: 'critic',
      providerUsed: criticResponse.provider || 'lmstudio',
      content: criticContent,
      reasoningContent: typeof criticResponse.reasoning_content === 'string' ? criticResponse.reasoning_content : null,
      verdict
    }));

    completedRounds = roundNo;
    if (verdict === 'approved') break;
  }

  return {
    ok: true,
    collab_session_id: collabSessionId,
    project_code: detected.detected_project_code,
    detection: detected,
    final_content: writerContent,
    final_verdict: verdict,
    total_rounds: completedRounds,
    max_rounds: resolvedMaxRounds,
    rounds
  };
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
    providerResult = await executeProviderAnswer({ question, detected, context, payload: { ...payload, provider: requestedProvider }, db, agentSessionId });
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
          safeJson(providerResult.gateway_decision
            ? { ...providerResult.gateway_decision, tool_audit: providerResult.tool_audit || null }
            : { tool_audit: providerResult.tool_audit || null }),
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
    // Surfaced separately from provider_fallback_used: this is LM Studio returning an empty/
    // too-short answer with no error at all (see testLmStudioLiveProvider's retry-once logic),
    // not a route/execution failure - callers need to tell the two apart.
    lmstudio_retried: providerResult.provider_response?.lmstudio_retried ?? false,
    lmstudio_retry_exhausted: providerResult.provider_response?.lmstudio_retry_exhausted ?? false,
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
    tool_used: Boolean(providerResult.tool_audit?.tool_used),
    tool_audit: providerResult.tool_audit || null,
    crm_tool_used: Boolean(providerResult.tool_audit?.tool_used && providerResult.tool_audit?.tool_name === 'search_listings'),
    crm_tool_audit: providerResult.tool_audit?.tool_name === 'search_listings' ? providerResult.tool_audit : null,
    github_tool_used: Boolean(providerResult.tool_audit?.tool_used && providerResult.tool_audit?.tool_name === 'get_recent_commits'),
    github_tool_audit: providerResult.tool_audit?.tool_name === 'get_recent_commits' ? providerResult.tool_audit : null,
    write_proposal_used: Boolean(providerResult.tool_audit?.tool_used && providerResult.tool_audit?.tool_name === 'propose_github_issue'),
    write_proposal_audit: providerResult.tool_audit?.tool_name === 'propose_github_issue' ? providerResult.tool_audit : null,
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
  addProjectRule,
  updateProjectRule,
  getActiveGuidelines,
  addProjectGuideline,
  listProjectGuidelines,
  detectProject,
  searchMemoryContext,
  executeProviderAnswer,
  runWriterCriticLoop,
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
