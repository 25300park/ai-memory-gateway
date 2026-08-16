'use strict';

// Phase 23-1: task board CRUD - mounted as a sub-router of ai.routes.js (see the
// `router.use('/task-board', taskBoardRoutes)` line there), so it inherits the same
// aiRateLimiter + adminApiAuthMiddleware already applied to the whole /ai mount in app.js.
// No browser-direct-access carve-out here (unlike the Phase 22-8 upload routes) - this is
// only ever called through the console's server-side proxy, same as every other /ai/agent/*
// or /ai/imports/* endpoint.
const express = require('express');
const router = express.Router();
const taskBoardService = require('../services/task-board.service');
const { sendStandardError } = require('../services/api-error.service');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/items', asyncHandler(async (req, res) => {
  const systemCode = req.query.system_code;
  const items = await taskBoardService.listTaskBoardItems({ systemCode });
  res.json({ ok: true, items });
}));

router.post('/items', asyncHandler(async (req, res) => {
  const { system_code: systemCode, title, description, linked_pending_action_id: linkedPendingActionId } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    return sendStandardError(res, {
      req,
      code: 'VALIDATION_ERROR',
      message: 'title is required.',
      statusCode: 400,
      source: 'task-board.routes:POST /items'
    });
  }
  if (!taskBoardService.isValidSystemCode(systemCode)) {
    return sendStandardError(res, {
      req,
      code: 'VALIDATION_ERROR',
      message: `system_code must be one of: ${Object.keys(taskBoardService.SYSTEMS).join(', ')}.`,
      statusCode: 400,
      source: 'task-board.routes:POST /items'
    });
  }

  const item = await taskBoardService.createTaskBoardItem({
    systemCode,
    title: title.trim(),
    description,
    linkedPendingActionId
  });
  res.json({ ok: true, item });
}));

router.patch('/items/:id', asyncHandler(async (req, res) => {
  const { title, description } = req.body || {};
  const item = await taskBoardService.updateTaskBoardItem(req.params.id, { title, description });

  if (!item) {
    return sendStandardError(res, {
      req,
      code: 'TASK_BOARD_ITEM_NOT_FOUND',
      message: `No task board item found for id "${req.params.id}".`,
      statusCode: 404,
      source: 'task-board.routes:PATCH /items/:id'
    });
  }
  res.json({ ok: true, item });
}));

router.patch('/items/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};

  if (!taskBoardService.isValidKanbanStatus(status)) {
    return sendStandardError(res, {
      req,
      code: 'VALIDATION_ERROR',
      message: `status must be one of: ${taskBoardService.KANBAN_STATUSES.join(', ')}.`,
      statusCode: 400,
      source: 'task-board.routes:PATCH /items/:id/status'
    });
  }

  const item = await taskBoardService.updateTaskBoardItemStatus(req.params.id, status);
  if (!item) {
    return sendStandardError(res, {
      req,
      code: 'TASK_BOARD_ITEM_NOT_FOUND',
      message: `No task board item found for id "${req.params.id}".`,
      statusCode: 404,
      source: 'task-board.routes:PATCH /items/:id/status'
    });
  }
  res.json({ ok: true, item });
}));

router.delete('/items/:id', asyncHandler(async (req, res) => {
  const deleted = await taskBoardService.deleteTaskBoardItem(req.params.id);
  if (!deleted) {
    return sendStandardError(res, {
      req,
      code: 'TASK_BOARD_ITEM_NOT_FOUND',
      message: `No task board item found for id "${req.params.id}".`,
      statusCode: 404,
      source: 'task-board.routes:DELETE /items/:id'
    });
  }
  res.json({ ok: true, deleted: true });
}));

router.get('/systems', asyncHandler(async (req, res) => {
  res.json({ ok: true, systems: taskBoardService.SYSTEMS });
}));

module.exports = router;
