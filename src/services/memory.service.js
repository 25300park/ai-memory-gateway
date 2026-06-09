const pool = require("../config/db");

const {
  MEMORY_STATUS,
  QUEUE_STATUS,
  isValidMemoryStatus,
  isValidQueueStatus
} = require("../constants/status.constants");

async function searchMemory({ project_code, keyword, limit = 10 }) {
  const likeKeyword = `%${keyword || ""}%`;

  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      source_ai,
      memory_type,
      title,
      summary,
      detail,
      tags,
      importance,
      status,
      created_at,
      updated_at
    FROM ai_memory
    WHERE project_code = ?
      AND status = 'active'
      AND (
        title LIKE ?
        OR summary LIKE ?
        OR detail LIKE ?
        OR tags LIKE ?
      )
    ORDER BY importance DESC, created_at DESC
    LIMIT ?
    `,
    [
      project_code,
      likeKeyword,
      likeKeyword,
      likeKeyword,
      likeKeyword,
      Number(limit)
    ]
  );

  return rows;
}

async function getRecentMemory({ project_code, limit = 10 }) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      source_ai,
      memory_type,
      title,
      summary,
      tags,
      importance,
      status,
      created_at
    FROM ai_memory
    WHERE project_code = ?
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [project_code, Number(limit)]
  );

  return rows;
}

async function getSessionLogs({ session_id, limit = 20 }) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      session_id,
      source_ai,
      conversation_title,
      user_message,
      assistant_message,
      summary,
      model_name,
      status,
      created_at
    FROM ai_conversation_logs
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [session_id, Number(limit)]
  );

  return rows;
}

async function getProjectAssets({ project_code }) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      asset_type,
      title,
      content,
      priority,
      is_active,
      created_at,
      updated_at
    FROM project_assets
    WHERE project_code = ?
      AND is_active = TRUE
    ORDER BY priority DESC, created_at ASC
    `,
    [project_code]
  );

  return rows;
}

async function findDuplicateMemory({ project_code, title, summary }) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      title,
      summary,
      status,
      created_at
    FROM ai_memory
    WHERE project_code = ?
      AND title = ?
      AND summary = ?
      AND status != ?
    LIMIT 1
    `,
    [
      project_code,
      title,
      summary,
      MEMORY_STATUS.ARCHIVED
    ]
  );

  return rows[0] || null;
}

async function saveManualMemory({
  project_code,
  source_ai = "manual",
  memory_type = "manual_note",
  title,
  summary,
  detail = null,
  tags = null,
  importance = 3,
  status = MEMORY_STATUS.ACTIVE
}) {
  if (!isValidMemoryStatus(status)) {
    throw new Error(
      `Invalid memory status. Allowed values: ${Object.values(MEMORY_STATUS).join(", ")}`
    );
  }

  const duplicate = await findDuplicateMemory({
  project_code,
  title,
  summary
});

if (duplicate) {
  const error = new Error(
    `Duplicate memory found. Existing memory id: ${duplicate.id}`
  );
  error.code = "DUPLICATE_MEMORY";
  error.statusCode = 409;
  throw error;
}

  const [result] = await pool.query(
    `
    INSERT INTO ai_memory (
      project_code,
      source_ai,
      memory_type,
      title,
      summary,
      detail,
      tags,
      importance,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      project_code,
      source_ai,
      memory_type,
      title,
      summary,
      detail,
      tags,
      Number(importance),
      status
    ]
  );

  return {
    id: result.insertId,
    project_code,
    source_ai,
    memory_type,
    title,
    summary,
    detail,
    tags,
    importance: Number(importance),
    status
  };
}

async function updateMemoryStatus({ id, status }) {
  if (!isValidMemoryStatus(status)) {
    throw new Error(
      `Invalid memory status. Allowed values: ${Object.values(MEMORY_STATUS).join(", ")}`
    );
  }

  const [result] = await pool.query(
    `
    UPDATE ai_memory
    SET status = ?
    WHERE id = ?
    `,
    [status, id]
  );

  return {
    id,
    status,
    affectedRows: result.affectedRows
  };
}

async function findDuplicateProjectAsset({
  project_code,
  asset_type,
  title
}) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      asset_type,
      title,
      is_active,
      created_at
    FROM project_assets
    WHERE project_code = ?
      AND asset_type = ?
      AND title = ?
    LIMIT 1
    `,
    [
      project_code,
      asset_type,
      title
    ]
  );

  return rows[0] || null;
}

async function createProjectAsset({
  project_code,
  asset_type,
  title,
  content,
  priority = 3,
  is_active = true
}) {
  const allowedTypes = [
    "persona",
    "rule",
    "vocabulary",
    "reference_doc",
    "formatting",
    "workflow"
  ];

  if (!allowedTypes.includes(asset_type)) {
    throw new Error(
      "Invalid asset_type. Allowed values: persona, rule, vocabulary, reference_doc, formatting, workflow"
    );
  }

  const duplicate = await findDuplicateProjectAsset({
    project_code,
    asset_type,
    title
  });

  if (duplicate) {
    const error = new Error(
      `Duplicate project asset found. Existing asset id: ${duplicate.id}`
    );
    error.code = "DUPLICATE_PROJECT_ASSET";
    error.statusCode = 409;
    throw error;
  }

  const [result] = await pool.query(
    `
    INSERT INTO project_assets (
      project_code,
      asset_type,
      title,
      content,
      priority,
      is_active
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      project_code,
      asset_type,
      title,
      content,
      Number(priority),
      Boolean(is_active)
    ]
  );

  return {
    id: result.insertId,
    project_code,
    asset_type,
    title,
    content,
    priority: Number(priority),
    is_active: Boolean(is_active)
  };
}

async function updateProjectAsset({
  id,
  asset_type,
  title,
  content,
  priority,
  is_active
}) {
  const allowedTypes = [
    "persona",
    "rule",
    "vocabulary",
    "reference_doc",
    "formatting",
    "workflow"
  ];

  if (asset_type && !allowedTypes.includes(asset_type)) {
    throw new Error(
      "Invalid asset_type. Allowed values: persona, rule, vocabulary, reference_doc, formatting, workflow"
    );
  }

  const fields = [];
  const values = [];

  if (asset_type !== undefined) {
    fields.push("asset_type = ?");
    values.push(asset_type);
  }

  if (title !== undefined) {
    fields.push("title = ?");
    values.push(title);
  }

  if (content !== undefined) {
    fields.push("content = ?");
    values.push(content);
  }

  if (priority !== undefined) {
    fields.push("priority = ?");
    values.push(Number(priority));
  }

  if (is_active !== undefined) {
    fields.push("is_active = ?");
    values.push(Boolean(is_active));
  }

  if (fields.length === 0) {
    throw new Error("At least one field is required to update.");
  }

  values.push(id);

  const [result] = await pool.query(
    `
    UPDATE project_assets
    SET ${fields.join(", ")}
    WHERE id = ?
    `,
    values
  );

  return {
    id,
    affectedRows: result.affectedRows,
    updated_fields: fields.map((field) => field.split(" = ")[0])
  };
}

function normalizeQueueIds(ids = []) {
  return [...new Set(
    ids
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
}

async function retryFailedSummaryQueue({ limit = 10, ids = null }) {
  const normalizedIds = Array.isArray(ids) ? normalizeQueueIds(ids) : [];

  if (normalizedIds.length > 0) {
    const placeholders = normalizedIds.map(() => "?").join(", ");

    const [result] = await pool.query(
      `
      UPDATE ai_summary_queue
      SET status = ?,
          error_message = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = ?
        AND id IN (${placeholders})
      `,
      [
        QUEUE_STATUS.PENDING,
        QUEUE_STATUS.FAILED,
        ...normalizedIds
      ]
    );

    return {
      retried_count: result.affectedRows,
      requested_ids: normalizedIds,
      mode: "selected",
      from_status: QUEUE_STATUS.FAILED,
      to_status: QUEUE_STATUS.PENDING
    };
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));

  const [result] = await pool.query(
    `
    UPDATE ai_summary_queue
    SET status = ?,
        error_message = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE status = ?
    ORDER BY updated_at ASC
    LIMIT ?
    `,
    [
      QUEUE_STATUS.PENDING,
      QUEUE_STATUS.FAILED,
      safeLimit
    ]
  );

  return {
    retried_count: result.affectedRows,
    limit: safeLimit,
    mode: "bulk",
    from_status: QUEUE_STATUS.FAILED,
    to_status: QUEUE_STATUS.PENDING
  };
}

async function retrySummaryQueueItem({ id }) {
  const queueId = Number(id);

  if (!Number.isInteger(queueId) || queueId <= 0) {
    throw new Error("Valid queue id is required.");
  }

  const [result] = await pool.query(
    `
    UPDATE ai_summary_queue
    SET status = ?,
        error_message = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = ?
    `,
    [
      QUEUE_STATUS.PENDING,
      queueId,
      QUEUE_STATUS.FAILED
    ]
  );

  return {
    id: queueId,
    retried_count: result.affectedRows,
    from_status: QUEUE_STATUS.FAILED,
    to_status: QUEUE_STATUS.PENDING
  };
}

async function resetStuckProcessingQueue({ older_than_minutes = 30, limit = 20 }) {
  const safeMinutes = Math.max(5, Math.min(Number(older_than_minutes) || 30, 1440));
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  const [result] = await pool.query(
    `
    UPDATE ai_summary_queue
    SET status = ?,
        error_message = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE status = ?
      AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
    ORDER BY updated_at ASC
    LIMIT ?
    `,
    [
      QUEUE_STATUS.PENDING,
      QUEUE_STATUS.PROCESSING,
      safeMinutes,
      safeLimit
    ]
  );

  return {
    reset_count: result.affectedRows,
    older_than_minutes: safeMinutes,
    limit: safeLimit,
    from_status: QUEUE_STATUS.PROCESSING,
    to_status: QUEUE_STATUS.PENDING
  };
}

async function getSummaryQueueStats() {
  const [rows] = await pool.query(
    `
    SELECT
      status,
      COUNT(*) AS count,
      MIN(created_at) AS oldest_created_at,
      MAX(updated_at) AS latest_updated_at
    FROM ai_summary_queue
    GROUP BY status
    ORDER BY status
    `
  );

  return rows.map((row) => ({
    status: row.status,
    count: Number(row.count || 0),
    oldest_created_at: row.oldest_created_at,
    latest_updated_at: row.latest_updated_at
  }));
}

async function getSummaryQueue({
  status,
  project_code,
  limit = 20
}) {
  if (status && !isValidQueueStatus(status)) {
    throw new Error(
      `Invalid queue status. Allowed values: ${Object.values(QUEUE_STATUS).join(", ")}`
    );
  }

  const where = [];
  const values = [];

  if (status) {
    where.push("status = ?");
    values.push(status);
  }

  if (project_code) {
    where.push("project_code = ?");
    values.push(project_code);
  }

  const whereClause = where.length > 0
    ? `WHERE ${where.join(" AND ")}`
    : "";

  values.push(Number(limit));

  const [rows] = await pool.query(
    `
    SELECT
      id,
      conversation_log_id,
      project_code,
      source_ai,
      summary_model,
      status,
      priority,
      attempt_count,
      error_message,
      created_at,
      updated_at
    FROM ai_summary_queue
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    values
  );

  return rows;
}

async function getMemoryById({ id }) {
  const [memoryRows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      source_ai,
      memory_type,
      title,
      summary,
      detail,
      tags,
      importance,
      status,
      memory_date,
      created_at,
      updated_at
    FROM ai_memory
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );

  const memory = memoryRows[0] || null;

  if (!memory) {
    return null;
  }

  const [linkedLogs] = await pool.query(
    `
    SELECT
      l.id AS link_id,
      l.link_type,
      l.created_at AS linked_at,

      c.id AS conversation_log_id,
      c.project_code,
      c.session_id,
      c.source_ai,
      c.conversation_title,
      c.user_message,
      c.assistant_message,
      c.summary AS conversation_summary,
      c.model_name,
      c.status AS conversation_status,
      c.created_at AS conversation_created_at
    FROM ai_memory_links l
    JOIN ai_conversation_logs c
      ON l.conversation_log_id = c.id
    WHERE l.memory_id = ?
    ORDER BY l.created_at DESC
    `,
    [id]
  );

  return {
    memory,
    linked_conversations: linkedLogs
  };
}

async function getConversationById({ id }) {
  const [conversationRows] = await pool.query(
    `
    SELECT
      id,
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
      started_at,
      ended_at,
      file_path,
      status,
      created_at,
      updated_at
    FROM ai_conversation_logs
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );

  const conversation = conversationRows[0] || null;

  if (!conversation) {
    return null;
  }

  const [linkedMemories] = await pool.query(
    `
    SELECT
      l.id AS link_id,
      l.link_type,
      l.created_at AS linked_at,

      m.id AS memory_id,
      m.project_code,
      m.source_ai,
      m.memory_type,
      m.title,
      m.summary,
      m.detail,
      m.tags,
      m.importance,
      m.status AS memory_status,
      m.created_at AS memory_created_at
    FROM ai_memory_links l
    JOIN ai_memory m
      ON l.memory_id = m.id
    WHERE l.conversation_log_id = ?
    ORDER BY l.created_at DESC
    `,
    [id]
  );

  return {
    conversation,
    linked_memories: linkedMemories
  };
}

async function getProjectList({ status } = {}) {
  const where = [];
  const values = [];

  if (status) {
    where.push("status = ?");
    values.push(status);
  }

  const whereClause = where.length > 0
    ? `WHERE ${where.join(" AND ")}`
    : "";

  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      project_name,
      description,
      status,
      created_at,
      updated_at
    FROM ai_projects
    ${whereClause}
    ORDER BY created_at DESC
    `,
    values
  );

  return rows;
}

module.exports = {
  searchMemory,
  getRecentMemory,
  getSessionLogs,
  getProjectAssets,
  saveManualMemory,
  updateMemoryStatus,
  createProjectAsset,
  updateProjectAsset,
  retryFailedSummaryQueue,
  retrySummaryQueueItem,
  resetStuckProcessingQueue,
  getSummaryQueueStats,
  getSummaryQueue,
  getMemoryById,
  getConversationById,
  getProjectList
};