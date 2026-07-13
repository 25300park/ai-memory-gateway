'use strict';

/**
 * Phase 6-4: propose/approve queue for write-side agent actions.
 *
 * The agent never calls a write API (e.g. GitHub issue creation) directly.
 * Instead, tools like propose_github_issue insert a row here with
 * status='pending' and return a confirmation message to the user. Approving
 * a row only flips its status - no external system is touched in this phase.
 */

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
  return { ...row, payload: parsedPayload };
}

async function proposeAction(db, { project_code, agent_session_id, action_type, payload, proposed_by } = {}) {
  await ensurePendingActionsTable(db);

  if (!action_type) throw new Error('action_type is required');

  const [result] = await db.query(
    `INSERT INTO pending_actions (project_code, agent_session_id, action_type, payload, status, proposed_by)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    [
      project_code || null,
      agent_session_id || null,
      String(action_type),
      safeJson(payload),
      proposed_by || 'gateway_auto'
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
    `SELECT id, project_code, agent_session_id, action_type, payload, status, proposed_by, created_at, reviewed_at, review_note
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
    `SELECT id, project_code, agent_session_id, action_type, payload, status, proposed_by, created_at, reviewed_at, review_note
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

async function approveAction(db, id, { review_note } = {}) {
  return setActionStatus(db, id, 'approved', { review_note });
}

async function rejectAction(db, id, { review_note } = {}) {
  return setActionStatus(db, id, 'rejected', { review_note });
}

module.exports = {
  ensurePendingActionsTable,
  proposeAction,
  listPendingActions,
  getPendingActionById,
  approveAction,
  rejectAction
};
