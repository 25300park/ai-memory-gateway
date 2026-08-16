'use strict';

// Phase 23-1: task board backing store. No FK on system_code (validated against
// config/systems.js at write time instead) or linked_pending_action_id (deliberately loose -
// a pending_actions row can be deleted/pruned independently without this table ever knowing
// or blocking on it; the link is informational, not referential integrity).
const pool = require("../config/db");
const SYSTEMS = require("../config/systems");

const KANBAN_STATUSES = ["backlog", "in_progress", "review", "done"];

async function ensureTaskBoardItemsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_board_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      system_code VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      kanban_status ENUM('backlog','in_progress','review','done') NOT NULL DEFAULT 'backlog',
      linked_pending_action_id BIGINT UNSIGNED NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_task_board_system (system_code),
      INDEX idx_task_board_status (kanban_status),
      INDEX idx_task_board_linked_action (linked_pending_action_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function isValidSystemCode(systemCode) {
  return typeof systemCode === "string" && Object.prototype.hasOwnProperty.call(SYSTEMS, systemCode);
}

function isValidKanbanStatus(status) {
  return KANBAN_STATUSES.includes(status);
}

async function listTaskBoardItems({ systemCode } = {}) {
  await ensureTaskBoardItemsTable();
  if (systemCode) {
    const [rows] = await pool.query(
      `SELECT * FROM task_board_items WHERE system_code = ? ORDER BY sort_order ASC, id ASC`,
      [systemCode]
    );
    return rows;
  }
  const [rows] = await pool.query(`SELECT * FROM task_board_items ORDER BY sort_order ASC, id ASC`);
  return rows;
}

async function createTaskBoardItem({ systemCode, title, description, linkedPendingActionId }) {
  await ensureTaskBoardItemsTable();
  const [result] = await pool.query(
    `INSERT INTO task_board_items (system_code, title, description, linked_pending_action_id)
     VALUES (?, ?, ?, ?)`,
    [systemCode, title, description || null, linkedPendingActionId || null]
  );
  const insertedId = Number(result.insertId);
  const [rows] = await pool.query(`SELECT * FROM task_board_items WHERE id = ?`, [insertedId]);
  return rows[0];
}

async function updateTaskBoardItem(id, { title, description }) {
  await ensureTaskBoardItemsTable();
  const fields = [];
  const params = [];
  if (title !== undefined) {
    fields.push("title = ?");
    params.push(title);
  }
  if (description !== undefined) {
    fields.push("description = ?");
    params.push(description);
  }
  if (!fields.length) return getTaskBoardItem(id);

  params.push(id);
  const [result] = await pool.query(`UPDATE task_board_items SET ${fields.join(", ")} WHERE id = ?`, params);
  if (Number(result.affectedRows || 0) === 0) return null;
  return getTaskBoardItem(id);
}

async function updateTaskBoardItemStatus(id, status) {
  await ensureTaskBoardItemsTable();
  const [result] = await pool.query(`UPDATE task_board_items SET kanban_status = ? WHERE id = ?`, [status, id]);
  if (Number(result.affectedRows || 0) === 0) return null;
  return getTaskBoardItem(id);
}

async function deleteTaskBoardItem(id) {
  await ensureTaskBoardItemsTable();
  const [result] = await pool.query(`DELETE FROM task_board_items WHERE id = ?`, [id]);
  return Number(result.affectedRows || 0) > 0;
}

async function getTaskBoardItem(id) {
  const [rows] = await pool.query(`SELECT * FROM task_board_items WHERE id = ?`, [id]);
  return rows[0] || null;
}

module.exports = {
  KANBAN_STATUSES,
  SYSTEMS,
  ensureTaskBoardItemsTable,
  isValidSystemCode,
  isValidKanbanStatus,
  listTaskBoardItems,
  createTaskBoardItem,
  updateTaskBoardItem,
  updateTaskBoardItemStatus,
  deleteTaskBoardItem,
  getTaskBoardItem
};
