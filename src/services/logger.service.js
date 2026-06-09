const pool = require("../config/db");

function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function toInt(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

async function cleanupRecentBuffer(session_id, keepLimit = 10) {
  const normalizedKeepLimit = toInt(keepLimit, 10);

  const [beforeRows] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM ai_recent_buffer
    WHERE session_id = ?
    `,
    [session_id]
  );

  await pool.query(
    `
    DELETE FROM ai_recent_buffer
    WHERE session_id = ?
      AND id NOT IN (
        SELECT id FROM (
          SELECT id
          FROM ai_recent_buffer
          WHERE session_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        ) AS recent_keep
      )
    `,
    [session_id, session_id, normalizedKeepLimit]
  );

  const [afterRows] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM ai_recent_buffer
    WHERE session_id = ?
    `,
    [session_id]
  );

  return {
    session_id,
    keep_limit: normalizedKeepLimit,
    before_count: Number(beforeRows[0]?.count || 0),
    after_count: Number(afterRows[0]?.count || 0),
    deleted_count: Math.max(0, Number(beforeRows[0]?.count || 0) - Number(afterRows[0]?.count || 0))
  };
}

async function insertRecentBufferPair({
  project_code,
  session_id,
  source_ai,
  user_message,
  assistant_message
}) {
  const userTokenCount = estimateTokenCount(user_message);
  const assistantTokenCount = estimateTokenCount(assistant_message);

  const [result] = await pool.query(
    `
    INSERT INTO ai_recent_buffer (
      project_code,
      session_id,
      role,
      message,
      token_count,
      source_ai
    ) VALUES
    (?, ?, 'user', ?, ?, ?),
    (?, ?, 'assistant', ?, ?, ?)
    `,
    [
      project_code,
      session_id,
      user_message,
      userTokenCount,
      source_ai || "chatgpt",
      project_code,
      session_id,
      assistant_message,
      assistantTokenCount,
      source_ai || "chatgpt"
    ]
  );

  return {
    inserted_count: Number(result?.affectedRows || 2),
    user_token_count: userTokenCount,
    assistant_token_count: assistantTokenCount
  };
}

async function enqueueSummary({
  conversationLogId,
  project_code,
  source_ai,
  summary_model = "gpt-4o-mini",
  priority = 3
}) {
  const [result] = await pool.query(
    `
    INSERT INTO ai_summary_queue (
      conversation_log_id,
      project_code,
      source_ai,
      summary_model,
      status,
      priority
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      conversationLogId,
      project_code,
      source_ai || "chatgpt",
      summary_model,
      "pending",
      priority
    ]
  );

  return {
    summary_queue_id: result.insertId || null,
    status: "pending"
  };
}

async function logConversation({
  project_code,
  session_id,
  user_id,
  source_ai,
  model_name,
  user_message,
  assistant_message,
  raw_text,
  recent_buffer_keep_limit = 10,
  create_summary_queue = true,
  summary_model = "gpt-4o-mini",
  summary_priority = 3
}) {
  return logConversationEnhanced({
    project_code,
    session_id,
    user_id,
    source_ai,
    model_name,
    user_message,
    assistant_message,
    raw_text,
    recent_buffer_keep_limit,
    create_summary_queue,
    summary_model,
    summary_priority
  });
}

async function logConversationEnhanced({
  project_code,
  session_id,
  user_id,
  source_ai,
  model_name,
  user_message,
  assistant_message,
  raw_text,
  recent_buffer_keep_limit = 10,
  create_summary_queue = true,
  summary_model = "gpt-4o-mini",
  summary_priority = 3
}) {
  if (!project_code || !session_id || !user_message || !assistant_message) {
    throw new Error("project_code, session_id, user_message, and assistant_message are required for response storage.");
  }

  const normalizedSourceAi = source_ai || "chatgpt";
  const normalizedRawText = raw_text || `User: ${user_message}\n\nAssistant: ${assistant_message}`;
  const totalTokenCount = estimateTokenCount(`${user_message}\n${assistant_message}`);

  const storageSteps = [];

  const [logResult] = await pool.query(
    `
    INSERT INTO ai_conversation_logs (
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      project_code,
      session_id,
      normalizedSourceAi,
      "AI Gateway Conversation",
      user_message,
      assistant_message,
      normalizedRawText,
      "Pending summary",
      model_name || null,
      totalTokenCount,
      "active"
    ]
  );

  const conversationLogId = logResult.insertId;
  storageSteps.push({
    name: "conversation_log",
    status: "saved",
    id: conversationLogId,
    token_count: totalTokenCount
  });

  const bufferResult = await insertRecentBufferPair({
    project_code,
    session_id,
    source_ai: normalizedSourceAi,
    user_message,
    assistant_message
  });
  storageSteps.push({
    name: "recent_buffer_insert",
    status: "saved",
    ...bufferResult
  });

  const cleanupResult = await cleanupRecentBuffer(session_id, recent_buffer_keep_limit);
  storageSteps.push({
    name: "recent_buffer_cleanup",
    status: "completed",
    ...cleanupResult
  });

  let summaryQueueResult = {
    summary_queue_id: null,
    status: "skipped"
  };

  if (create_summary_queue) {
    summaryQueueResult = await enqueueSummary({
      conversationLogId,
      project_code,
      source_ai: normalizedSourceAi,
      summary_model,
      priority: summary_priority
    });
    storageSteps.push({
      name: "summary_queue",
      status: "created",
      ...summaryQueueResult
    });
  } else {
    storageSteps.push({
      name: "summary_queue",
      status: "skipped",
      reason: "create_summary_queue=false"
    });
  }

  return {
    conversationLogId,
    conversation_log_id: conversationLogId,
    recent_buffer: bufferResult,
    recent_buffer_cleanup: cleanupResult,
    summary_queue: summaryQueueResult,
    summary_queue_id: summaryQueueResult.summary_queue_id,
    token_count: totalTokenCount,
    storage_steps: storageSteps,
    stored_at: new Date().toISOString()
  };
}

async function getResponseStorageStatus({ project_code, session_id, limit = 10 }) {
  if (!project_code || !session_id) {
    throw new Error("project_code and session_id are required.");
  }

  const normalizedLimit = toInt(limit, 10);

  const [conversationRows] = await pool.query(
    `
    SELECT id, project_code, session_id, source_ai, model_name, token_count, status, created_at
    FROM ai_conversation_logs
    WHERE project_code = ? AND session_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
    `,
    [project_code, session_id, normalizedLimit]
  );

  const [recentRows] = await pool.query(
    `
    SELECT id, project_code, session_id, role, LEFT(message, 500) AS message_preview, token_count, source_ai, created_at
    FROM ai_recent_buffer
    WHERE project_code = ? AND session_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
    `,
    [project_code, session_id, normalizedLimit]
  );

  const [queueRows] = await pool.query(
    `
    SELECT q.id, q.conversation_log_id, q.project_code, q.source_ai, q.summary_model, q.status, q.priority, q.created_at, q.updated_at
    FROM ai_summary_queue q
    LEFT JOIN ai_conversation_logs l ON l.id = q.conversation_log_id
    WHERE q.project_code = ?
      AND (l.session_id = ? OR q.conversation_log_id IN (
        SELECT id FROM ai_conversation_logs WHERE project_code = ? AND session_id = ?
      ))
    ORDER BY q.created_at DESC, q.id DESC
    LIMIT ?
    `,
    [project_code, session_id, project_code, session_id, normalizedLimit]
  );

  const [countRows] = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM ai_conversation_logs WHERE project_code = ? AND session_id = ?) AS conversation_count,
      (SELECT COUNT(*) FROM ai_recent_buffer WHERE project_code = ? AND session_id = ?) AS recent_buffer_count,
      (SELECT COUNT(*) FROM ai_summary_queue q
        LEFT JOIN ai_conversation_logs l ON l.id = q.conversation_log_id
        WHERE q.project_code = ? AND (l.session_id = ? OR q.conversation_log_id IN (
          SELECT id FROM ai_conversation_logs WHERE project_code = ? AND session_id = ?
        ))) AS summary_queue_count
    `,
    [project_code, session_id, project_code, session_id, project_code, session_id, project_code, session_id]
  );

  const counts = countRows[0] || {};

  return {
    ok: true,
    project_code,
    session_id,
    limit: normalizedLimit,
    counts: {
      conversation_logs: Number(counts.conversation_count || 0),
      recent_buffer: Number(counts.recent_buffer_count || 0),
      summary_queue: Number(counts.summary_queue_count || 0)
    },
    latest: {
      conversation_log: conversationRows[0] || null,
      recent_buffer: recentRows[0] || null,
      summary_queue: queueRows[0] || null
    },
    conversation_logs: conversationRows,
    recent_buffer: recentRows,
    summary_queue: queueRows
  };
}

module.exports = {
  estimateTokenCount,
  cleanupRecentBuffer,
  logConversation,
  logConversationEnhanced,
  getResponseStorageStatus
};
