const pool = require("../config/db");

function toInt(value, defaultValue = 5, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.min(Math.floor(n), max);
}

function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function stringifySafe(value) {
  return JSON.stringify(value, (key, val) => (typeof val === "bigint" ? val.toString() : val), 2);
}

function buildSummaryFromConversation(log) {
  const userMessage = log.user_message || "";
  const assistantMessage = log.assistant_message || "";
  const projectCode = log.project_code || "unknown_project";
  const sessionId = log.session_id || "";

  const title = `Summary: ${log.conversation_title || sessionId || "AI Conversation"}`.slice(0, 255);

  const summary = [
    `이 기록은 ${projectCode} 프로젝트의 AI 응답 대화 요약입니다.`,
    userMessage ? `사용자 요청: ${userMessage.slice(0, 220)}` : "사용자 요청 정보 없음.",
    assistantMessage ? `응답 요지: ${assistantMessage.slice(0, 260)}` : "응답 정보 없음."
  ].join("\n");

  const detail = [
    `Project Code: ${projectCode}`,
    `Session ID: ${sessionId}`,
    `Source AI: ${log.source_ai || ""}`,
    `Model Name: ${log.model_name || ""}`,
    `Conversation Log ID: ${log.id}`,
    "",
    "[User Message]",
    userMessage,
    "",
    "[Assistant Message]",
    assistantMessage
  ].join("\n");

  const tags = [
    "ai_memory",
    "summary_worker",
    projectCode,
    log.source_ai || "ai",
    log.model_name || "model"
  ].filter(Boolean).join(",");

  return {
    memory_type: "conversation_summary",
    title,
    summary,
    detail,
    tags,
    importance: 3,
    token_count: estimateTokenCount(`${userMessage}\n${assistantMessage}`)
  };
}

async function getSummaryQueueCounts() {
  const [rows] = await pool.query(`
    SELECT status, COUNT(*) AS count
    FROM ai_summary_queue
    GROUP BY status
  `);

  const counts = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
  rows.forEach((row) => {
    const status = String(row.status || "unknown").toLowerCase();
    const count = Number(row.count || 0);
    counts[status] = count;
    counts.total += count;
  });

  return counts;
}

async function getPendingSummaryQueueItems(limit = 5, project_code = null) {
  const normalizedLimit = toInt(limit, 5, 100);
  const params = [];
  let where = "status = 'pending'";

  if (project_code) {
    where += " AND project_code = ?";
    params.push(project_code);
  }

  params.push(normalizedLimit);

  const [rows] = await pool.query(
    `
    SELECT *
    FROM ai_summary_queue
    WHERE ${where}
    ORDER BY priority DESC, created_at ASC, id ASC
    LIMIT ?
    `,
    params
  );

  return rows;
}

async function markQueueProcessing(queueId) {
  const [result] = await pool.query(
    `
    UPDATE ai_summary_queue
    SET status = 'processing',
        attempt_count = COALESCE(attempt_count, 0) + 1,
        error_message = NULL
    WHERE id = ? AND status = 'pending'
    `,
    [queueId]
  );

  return Number(result.affectedRows || 0) === 1;
}

async function markQueueCompleted(queueId, memoryId) {
  await pool.query(
    `
    UPDATE ai_summary_queue
    SET status = 'completed',
        error_message = NULL
    WHERE id = ?
    `,
    [queueId]
  );

  return { queue_id: queueId, memory_id: memoryId, status: "completed" };
}

async function markQueueFailed(queueId, errorMessage) {
  await pool.query(
    `
    UPDATE ai_summary_queue
    SET status = 'failed',
        error_message = ?
    WHERE id = ?
    `,
    [String(errorMessage || "Unknown summary worker error").slice(0, 1000), queueId]
  );
}

async function getConversationLog(conversationLogId) {
  const [rows] = await pool.query(
    `
    SELECT *
    FROM ai_conversation_logs
    WHERE id = ?
    LIMIT 1
    `,
    [conversationLogId]
  );

  return rows[0] || null;
}

async function findExistingSummaryMemory(conversationLogId) {
  const [rows] = await pool.query(
    `
    SELECT m.id
    FROM ai_memory_links ml
    INNER JOIN ai_memory m ON m.id = ml.memory_id
    WHERE ml.conversation_log_id = ?
      AND ml.link_type = 'summary_of'
      AND m.memory_type = 'conversation_summary'
    ORDER BY m.id DESC
    LIMIT 1
    `,
    [conversationLogId]
  );

  return rows[0]?.id || null;
}

async function saveSummaryMemory(queueItem, log, summaryData) {
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
      log.project_code || queueItem.project_code,
      log.source_ai || queueItem.source_ai || "chatgpt",
      summaryData.memory_type,
      summaryData.title,
      summaryData.summary,
      summaryData.detail,
      summaryData.tags,
      summaryData.importance,
      "active"
    ]
  );

  return result.insertId;
}

async function linkMemoryToConversation(memoryId, conversationLogId) {
  await pool.query(
    `
    INSERT INTO ai_memory_links (memory_id, conversation_log_id, link_type)
    VALUES (?, ?, ?)
    `,
    [memoryId, conversationLogId, "summary_of"]
  );
}

async function processSummaryQueueItem(queueItem, options = {}) {
  const startedAt = new Date();
  const queueId = queueItem.id;

  try {
    const locked = await markQueueProcessing(queueId);
    if (!locked) {
      return {
        success: false,
        skipped: true,
        queue_id: queueId,
        reason: "Queue item was not pending or was already taken by another worker."
      };
    }

    const log = await getConversationLog(queueItem.conversation_log_id);
    if (!log) {
      throw new Error(`Conversation log not found: ${queueItem.conversation_log_id}`);
    }

    if (options.prevent_duplicates !== false) {
      const existingMemoryId = await findExistingSummaryMemory(queueItem.conversation_log_id);
      if (existingMemoryId) {
        await markQueueCompleted(queueId, existingMemoryId);
        return {
          success: true,
          queue_id: queueId,
          memory_id: existingMemoryId,
          reused_existing_memory: true,
          duration_ms: Date.now() - startedAt.getTime()
        };
      }
    }

    const summaryData = buildSummaryFromConversation(log);
    const memoryId = await saveSummaryMemory(queueItem, log, summaryData);
    await linkMemoryToConversation(memoryId, queueItem.conversation_log_id);
    await markQueueCompleted(queueId, memoryId);

    return {
      success: true,
      queue_id: queueId,
      conversation_log_id: queueItem.conversation_log_id,
      memory_id: memoryId,
      reused_existing_memory: false,
      summary_title: summaryData.title,
      duration_ms: Date.now() - startedAt.getTime()
    };
  } catch (error) {
    await markQueueFailed(queueId, error.message);
    return {
      success: false,
      queue_id: queueId,
      error: error.message,
      duration_ms: Date.now() - startedAt.getTime()
    };
  }
}

async function processSummaryQueueBatch({ limit = 5, project_code = null, source = "manual_admin" } = {}) {
  const normalizedLimit = toInt(limit, 5, 100);
  const before_counts = await getSummaryQueueCounts();
  const items = await getPendingSummaryQueueItems(normalizedLimit, project_code);
  const results = [];

  for (const item of items) {
    const result = await processSummaryQueueItem(item, { prevent_duplicates: true });
    results.push(result);
  }

  const success = results.filter((item) => item.success).length;
  const failed = results.filter((item) => !item.success && !item.skipped).length;
  const skipped = results.filter((item) => item.skipped).length;
  const after_counts = await getSummaryQueueCounts();

  return {
    ok: true,
    mode: "summary_queue_batch_process",
    source,
    processed_at: new Date().toISOString(),
    project_code: project_code || null,
    requested_limit: normalizedLimit,
    pulled_count: items.length,
    success,
    failed,
    skipped,
    before_counts,
    after_counts,
    results
  };
}

async function drainPendingSummaryQueue({ limit_per_batch = 5, max_batches = 3, project_code = null } = {}) {
  const batches = [];
  const normalizedMaxBatches = toInt(max_batches, 3, 20);
  const normalizedLimit = toInt(limit_per_batch, 5, 50);

  for (let i = 0; i < normalizedMaxBatches; i += 1) {
    const batch = await processSummaryQueueBatch({
      limit: normalizedLimit,
      project_code,
      source: "manual_drain"
    });
    batches.push(batch);

    if (batch.pulled_count === 0) break;
  }

  const final_counts = await getSummaryQueueCounts();

  return {
    ok: true,
    mode: "summary_queue_drain",
    drained_at: new Date().toISOString(),
    project_code: project_code || null,
    limit_per_batch: normalizedLimit,
    max_batches: normalizedMaxBatches,
    batch_count: batches.length,
    total_success: batches.reduce((sum, batch) => sum + Number(batch.success || 0), 0),
    total_failed: batches.reduce((sum, batch) => sum + Number(batch.failed || 0), 0),
    total_skipped: batches.reduce((sum, batch) => sum + Number(batch.skipped || 0), 0),
    final_counts,
    batches
  };
}

async function getSummaryWorkerStatus({ project_code = null, recent_limit = 10 } = {}) {
  const normalizedLimit = toInt(recent_limit, 10, 50);
  const counts = await getSummaryQueueCounts();

  const projectFilter = project_code ? "WHERE project_code = ?" : "";
  const projectParams = project_code ? [project_code] : [];

  const [oldestPendingRows] = await pool.query(
    `
    SELECT id, project_code, conversation_log_id, priority, created_at
    FROM ai_summary_queue
    WHERE status = 'pending' ${project_code ? "AND project_code = ?" : ""}
    ORDER BY created_at ASC, id ASC
    LIMIT 1
    `,
    projectParams
  );

  const [recentQueueRows] = await pool.query(
    `
    SELECT id, conversation_log_id, project_code, source_ai, summary_model, status, priority, attempt_count, error_message, created_at, updated_at
    FROM ai_summary_queue
    ${projectFilter}
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
    `,
    [...projectParams, normalizedLimit]
  );

  const [recentMemoryRows] = await pool.query(
    `
    SELECT id, project_code, title, memory_type, status, created_at
    FROM ai_memory
    WHERE memory_type = 'conversation_summary' ${project_code ? "AND project_code = ?" : ""}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
    `,
    [...projectParams, normalizedLimit]
  );

  const warnings = [];
  const errors = [];
  if (counts.failed > 0) errors.push(`Failed summary queue exists: ${counts.failed}`);
  if (counts.processing > 0) warnings.push(`Processing queue exists: ${counts.processing}`);
  if (counts.pending > 20) warnings.push(`Pending queue is high: ${counts.pending}`);

  let worker_status = "GOOD";
  if (errors.length) worker_status = "ERROR";
  else if (warnings.length) worker_status = "WARNING";

  return {
    ok: true,
    checked_at: new Date().toISOString(),
    project_code: project_code || null,
    worker_status,
    counts,
    oldest_pending: oldestPendingRows[0] || null,
    recent_queue: recentQueueRows,
    recent_summary_memory: recentMemoryRows,
    warnings,
    errors,
    commands: {
      run_once: "npm run worker:summary",
      run_loop: "npm run worker:summary:loop",
      admin_process_batch: "POST /ai/summary/process-batch",
      admin_drain: "POST /ai/summary/drain"
    }
  };
}

async function getSummaryIntegrationStatus({ project_code = null, session_id = null, limit = 10 } = {}) {
  const normalizedLimit = toInt(limit, 10, 50);
  const where = [];
  const params = [];

  if (project_code) {
    where.push("q.project_code = ?");
    params.push(project_code);
  }
  if (session_id) {
    where.push("l.session_id = ?");
    params.push(session_id);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [queueRows] = await pool.query(
    `
    SELECT q.id, q.conversation_log_id, q.project_code, q.source_ai, q.status, q.priority, q.attempt_count,
           q.error_message, q.created_at, q.updated_at,
           l.session_id, l.model_name
    FROM ai_summary_queue q
    LEFT JOIN ai_conversation_logs l ON l.id = q.conversation_log_id
    ${whereSql}
    ORDER BY q.created_at DESC, q.id DESC
    LIMIT ?
    `,
    [...params, normalizedLimit]
  );

  const [memoryRows] = await pool.query(
    `
    SELECT m.id, m.project_code, m.title, m.summary, m.status, m.created_at, ml.conversation_log_id
    FROM ai_memory m
    LEFT JOIN ai_memory_links ml ON ml.memory_id = m.id
    WHERE m.memory_type = 'conversation_summary'
      ${project_code ? "AND m.project_code = ?" : ""}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ?
    `,
    project_code ? [project_code, normalizedLimit] : [normalizedLimit]
  );

  const counts = await getSummaryQueueCounts();

  let integration_status = "GOOD";
  const warnings = [];
  const errors = [];
  if (counts.failed > 0) {
    integration_status = "ERROR";
    errors.push(`Failed summary queue exists: ${counts.failed}`);
  } else if (counts.pending > 0) {
    integration_status = "WARNING";
    warnings.push(`Pending summary queue exists: ${counts.pending}. Run worker or Process Batch.`);
  }

  return {
    ok: true,
    checked_at: new Date().toISOString(),
    project_code: project_code || null,
    session_id: session_id || null,
    integration_status,
    counts,
    recent_queue: queueRows,
    recent_summary_memory: memoryRows,
    warnings,
    errors,
    worker_connection: {
      response_test_creates_queue: true,
      process_batch_creates_memory: true,
      memory_link_created: true,
      summary_worker_reuses_same_service: true
    }
  };
}

module.exports = {
  stringifySafe,
  buildSummaryFromConversation,
  getSummaryQueueCounts,
  getPendingSummaryQueueItems,
  processSummaryQueueItem,
  processSummaryQueueBatch,
  drainPendingSummaryQueue,
  getSummaryWorkerStatus,
  getSummaryIntegrationStatus
};
