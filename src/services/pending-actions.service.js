'use strict';

/**
 * Phase 6-4/6-5: propose/approve/execute queue for write-side agent actions.
 *
 * The agent never calls a write API (e.g. GitHub issue creation) directly.
 * Instead, tools like propose_github_issue insert a row here with
 * status='pending'. Approving a row only flips its status to 'approved' -
 * the external system is only touched by the separate executeAction() call
 * (Phase 6-5), which requires status='approved' as a precondition.
 */

const githubTools = require('./github-tools.service');

let tableReady = false;

async function ensurePendingActionsTable(db) {
  if (tableReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS pending_actions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_code VARCHAR(120) NULL,
      agent_session_id VARCHAR(180) NULL,
      action_type VARCHAR(80) NOT NULL,
      payload TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      proposed_by VARCHAR(40) NOT NULL DEFAULT 'gateway_auto',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME NULL,
      review_note TEXT NULL,
      INDEX idx_project_code (project_code),
      INDEX idx_status (status),
      INDEX idx_action_type (action_type)
    )
  `);

  // Phase 12-2 added this column lazily (only when code-execution.service.js's own
  // executeCodeChangeProposal ran at least once). listPendingActions/getPendingActionById
  // now always SELECT it, so it must exist unconditionally here too - otherwise a fresh DB
  // that never ran a code execution would 500 on the very first GET /agent/actions.
  const [diffColumnRows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'pending_actions' AND column_name = 'diff_result'`
  );
  if (Number(diffColumnRows[0]?.cnt || 0) === 0) {
    await db.query(`ALTER TABLE pending_actions ADD COLUMN diff_result LONGTEXT NULL AFTER review_note`);
  }

  // Phase 20-1: tracks which pending_actions row (a dev_plan_proposal/team_plan_proposal)
  // a code_change_proposal was auto-generated from, when applicable. Nullable - most rows
  // (including every pre-existing one) have no source.
  const [sourceActionColumnRows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'pending_actions' AND column_name = 'source_action_id'`
  );
  if (Number(sourceActionColumnRows[0]?.cnt || 0) === 0) {
    await db.query(`ALTER TABLE pending_actions ADD COLUMN source_action_id BIGINT UNSIGNED NULL AFTER diff_result`);
    await db.query(`ALTER TABLE pending_actions ADD INDEX idx_source_action_id (source_action_id)`);
  }

  tableReady = true;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (_) {
    return null;
  }
}

function parsePayload(row) {
  if (!row) return row;
  let parsedPayload = null;
  try {
    parsedPayload = row.payload ? JSON.parse(row.payload) : null;
  } catch (_) {
    parsedPayload = row.payload;
  }
  return {
    ...row,
    payload: parsedPayload,
    // Phase 20-1: human-readable trace for auto-generated code_change_proposal rows -
    // GET /agent/actions callers don't need to know the source_action_id convention to
    // see that this row came from approving a plan, not from a person writing it directly.
    auto_generated_from: row.source_action_id ? `이 계획서(#${row.source_action_id})에서 자동 생성됨` : null
  };
}

async function proposeAction(db, { project_code, agent_session_id, action_type, payload, proposed_by, source_action_id } = {}) {
  await ensurePendingActionsTable(db);

  if (!action_type) throw new Error('action_type is required');

  const [result] = await db.query(
    `INSERT INTO pending_actions (project_code, agent_session_id, action_type, payload, status, proposed_by, source_action_id)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [
      project_code || null,
      agent_session_id || null,
      String(action_type),
      safeJson(payload),
      proposed_by || 'gateway_auto',
      source_action_id || null
    ]
  );

  return {
    ok: true,
    id: Number(result.insertId),
    project_code: project_code || null,
    agent_session_id: agent_session_id || null,
    action_type: String(action_type),
    status: 'pending',
    proposed_by: proposed_by || 'gateway_auto',
    source_action_id: source_action_id || null,
    message: '제안이 등록되었습니다. 콘솔에서 확인 후 승인해주세요.'
  };
}

async function listPendingActions(db, { project_code, status } = {}) {
  await ensurePendingActionsTable(db);

  const where = [];
  const params = [];

  if (project_code) {
    where.push('project_code = ?');
    params.push(project_code);
  }

  const resolvedStatus = status === undefined ? 'pending' : status;
  if (resolvedStatus && resolvedStatus !== 'all') {
    where.push('status = ?');
    params.push(resolvedStatus);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT id, project_code, agent_session_id, action_type, payload, status, proposed_by, created_at, reviewed_at, review_note, diff_result, source_action_id
     FROM pending_actions
     ${whereSql}
     ORDER BY id DESC
     LIMIT 200`,
    params
  );

  return { ok: true, count: rows.length, actions: rows.map(parsePayload) };
}

async function getPendingActionById(db, id) {
  await ensurePendingActionsTable(db);

  const [rows] = await db.query(
    `SELECT id, project_code, agent_session_id, action_type, payload, status, proposed_by, created_at, reviewed_at, review_note, diff_result, source_action_id
     FROM pending_actions
     WHERE id = ?`,
    [id]
  );

  return rows[0] ? parsePayload(rows[0]) : null;
}

async function setActionStatus(db, id, status, { review_note } = {}) {
  await ensurePendingActionsTable(db);

  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, error: `Invalid action id "${id}".` };
  }

  const existing = await getPendingActionById(db, numericId);
  if (!existing) {
    return { ok: false, error: `pending_actions row ${numericId} not found.` };
  }

  await db.query(
    `UPDATE pending_actions
     SET status = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
     WHERE id = ?`,
    [status, review_note || null, numericId]
  );

  const updated = await getPendingActionById(db, numericId);
  return { ok: true, action: updated };
}

// Phase 20-1: dev_plan_proposal/team_plan_proposal payloads both use `plan` for the final
// text (see runDevQaPlan/runPlanDevQaPipeline in phase17-personal-agent.service.js) -
// final_content/final_plan are checked too only as a defensive fallback in case that
// naming ever drifts.
const AUTO_CODE_PROPOSAL_ACTION_TYPES = ['dev_plan_proposal', 'team_plan_proposal'];
const CODE_EXECUTION_REPO_PATH = 'D:\\00. Ai_Memory_System\\api';

function extractPlanContent(payload) {
  if (!payload) return null;
  return payload.plan || payload.final_content || payload.final_plan || null;
}

// Registration only, same as every other proposeAction call in this codebase - status
// stays 'pending' here on purpose. Approving the plan is not approval to run code; that's
// a second, separate decision the same way execute-code already requires status='approved'
// before it will touch a worktree. Best-effort: a failure here must not undo the plan
// approval that already succeeded.
async function autoCreateCodeChangeProposal(db, sourceAction) {
  const planContent = extractPlanContent(sourceAction.payload);
  if (!planContent) return null;

  try {
    const created = await proposeAction(db, {
      project_code: sourceAction.project_code,
      agent_session_id: sourceAction.agent_session_id,
      action_type: 'code_change_proposal',
      payload: {
        instruction: `다음 개발 계획을 실행하세요: ${planContent}`,
        repoPath: CODE_EXECUTION_REPO_PATH
      },
      proposed_by: 'auto_from_plan_approval',
      source_action_id: sourceAction.id
    });
    return created.ok ? created.id : null;
  } catch (error) {
    console.error('[auto-create code_change_proposal failed]', error.message);
    return null;
  }
}

async function approveAction(db, id, { review_note } = {}) {
  const result = await setActionStatus(db, id, 'approved', { review_note });
  if (!result.ok) return result;

  let autoCreatedActionId = null;
  if (AUTO_CODE_PROPOSAL_ACTION_TYPES.includes(result.action.action_type)) {
    autoCreatedActionId = await autoCreateCodeChangeProposal(db, result.action);
  }

  return { ...result, auto_created_action_id: autoCreatedActionId };
}

async function rejectAction(db, id, { review_note } = {}) {
  return setActionStatus(db, id, 'rejected', { review_note });
}

function appendReviewNote(existingNote, line) {
  return existingNote ? `${existingNote}\n${line}` : line;
}

// Phase 6-5: the only path that actually touches an external system (GitHub, for now).
// Requires status='approved' - approving a row never triggers this on its own. On failure
// the row is marked 'failed' with the error recorded in review_note instead of throwing,
// mirroring the markQueueFailed pattern used by the summary worker (Phase 3).
async function executeAction(db, id) {
  await ensurePendingActionsTable(db);

  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, http_status: 400, error: `Invalid action id "${id}".` };
  }

  const existing = await getPendingActionById(db, numericId);
  if (!existing) {
    return { ok: false, http_status: 404, error: `pending_actions row ${numericId} not found.` };
  }

  if (existing.status !== 'approved') {
    return { ok: false, http_status: 400, error: '제안이 승인 상태가 아닙니다.' };
  }

  if (existing.action_type !== 'github_issue_create') {
    return { ok: false, http_status: 400, error: `Unsupported action_type "${existing.action_type}" for execution.` };
  }

  const { repo, title, body, labels } = existing.payload || {};

  try {
    const result = await githubTools.createGithubIssue({ repo, title, body, labels });

    await db.query(
      `UPDATE pending_actions SET status = 'executed', review_note = ? WHERE id = ?`,
      [appendReviewNote(existing.review_note, `[executed] issue_url=${result.issue_url}`), numericId]
    );

    return {
      ok: true,
      action: await getPendingActionById(db, numericId),
      issue_number: result.issue_number,
      issue_url: result.issue_url
    };
  } catch (error) {
    await db.query(
      `UPDATE pending_actions SET status = 'failed', review_note = ? WHERE id = ?`,
      [appendReviewNote(existing.review_note, `[execute_failed] ${error.message}`), numericId]
    );

    return {
      ok: false,
      action: await getPendingActionById(db, numericId),
      error: error.message
    };
  }
}

module.exports = {
  ensurePendingActionsTable,
  proposeAction,
  listPendingActions,
  getPendingActionById,
  approveAction,
  rejectAction,
  executeAction
};
