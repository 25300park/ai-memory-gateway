const pool = require("../config/db");
const importedConversationService = require("./imported-conversation.service");

function nowIso() {
  return new Date().toISOString();
}

function safeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return JSON.stringify({ serialization_error: true });
  }
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [tableName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function countRows(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return Number(rows[0]?.count || 0);
}

function buildChecklist(status = {}) {
  const storageReady = status.storage_ready === true;
  const conversationLogsReady = status.tables?.ai_conversation_logs === true;
  const summaryQueueReady = status.tables?.ai_summary_queue === true;
  const rawImportsReady = status.tables?.raw_imported_conversations === true;
  const messagesReady = status.tables?.imported_conversation_messages === true;
  const hasImported = Number(status.counts?.imported_conversations || 0) > 0;

  return [
    {
      key: "phase15_import_storage_ready",
      group: "storage",
      label: "Phase 15-1 imported conversation storage tables are ready.",
      required: true,
      status: storageReady ? "PASS" : "FAIL"
    },
    {
      key: "conversation_logs_table_ready",
      group: "target",
      label: "ai_conversation_logs table is available as the summary worker source table.",
      required: true,
      status: conversationLogsReady ? "PASS" : "FAIL"
    },
    {
      key: "summary_queue_table_ready",
      group: "target",
      label: "ai_summary_queue table is available for pending summary jobs.",
      required: true,
      status: summaryQueueReady ? "PASS" : "FAIL"
    },
    {
      key: "raw_imports_ready",
      group: "source",
      label: "raw_imported_conversations table contains imported conversations.",
      required: true,
      status: rawImportsReady && hasImported ? "PASS" : (rawImportsReady ? "ACTION_REQUIRED" : "FAIL")
    },
    {
      key: "imported_messages_ready",
      group: "source",
      label: "imported_conversation_messages table is available for rebuilding imported dialogue text.",
      required: true,
      status: messagesReady ? "PASS" : "FAIL"
    },
    {
      key: "eligible_imports_ready",
      group: "workflow",
      label: "There are imported conversations that can be queued for summary.",
      required: false,
      status: Number(status.counts?.eligible_for_queue || 0) > 0 ? "PASS" : "EMPTY"
    },
    {
      key: "summary_link_columns_ready",
      group: "workflow",
      label: "Imported conversations can store summary_queue_id and memory_id links.",
      required: true,
      status: rawImportsReady ? "PASS" : "FAIL"
    }
  ];
}

async function getSummaryQueueLinkStatus() {
  await importedConversationService.ensureImportedConversationTables();

  const tables = {
    raw_imported_conversations: await tableExists("raw_imported_conversations"),
    imported_conversation_messages: await tableExists("imported_conversation_messages"),
    imported_conversation_links: await tableExists("imported_conversation_links"),
    ai_conversation_logs: await tableExists("ai_conversation_logs"),
    ai_summary_queue: await tableExists("ai_summary_queue")
  };

  const counts = {
    imported_conversations: tables.raw_imported_conversations
      ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations`)
      : 0,
    eligible_for_queue: tables.raw_imported_conversations
      ? await countRows(`
          SELECT COUNT(*) AS count
          FROM raw_imported_conversations
          WHERE COALESCE(summary_queue_id, 0) = 0
            AND import_status IN ('imported', 'queued_failed', 'completed')
        `)
      : 0,
    queued_imports: tables.raw_imported_conversations
      ? await countRows(`
          SELECT COUNT(*) AS count
          FROM raw_imported_conversations
          WHERE COALESCE(summary_queue_id, 0) > 0
        `)
      : 0,
    pending_summary_queue: tables.ai_summary_queue
      ? await countRows(`SELECT COUNT(*) AS count FROM ai_summary_queue WHERE status = 'pending'`)
      : 0,
    import_links: tables.imported_conversation_links
      ? await countRows(`SELECT COUNT(*) AS count FROM imported_conversation_links WHERE link_type = 'summary_queue'`)
      : 0
  };

  const storageReady = Object.values(tables).every(Boolean);
  const status = {
    ok: storageReady,
    phase: "15-3",
    checked_at: nowIso(),
    link_status: storageReady ? "READY" : "ACTION_REQUIRED",
    storage_ready: storageReady,
    tables,
    counts
  };

  return {
    ...status,
    checklist: buildChecklist(status),
    next_actions: [
      "Run a small queue linkage test with limit 1 to 3.",
      "After queue creation, run npm run worker:summary or npm run worker:summary:loop.",
      "Review ai_memory and imported_conversation_links after worker completion."
    ]
  };
}

function normalizeRole(role) {
  const value = String(role || "").toLowerCase();
  if (value.includes("user") || value.includes("human")) return "user";
  if (value.includes("assistant") || value.includes("ai") || value.includes("model")) return "assistant";
  if (value.includes("system")) return "system";
  return "unknown";
}

function buildMessagesText(messages) {
  if (!messages || !messages.length) return "";
  return messages
    .map((message) => {
      const role = normalizeRole(message.role);
      const label = role === "assistant" ? "Assistant" : role === "user" ? "User" : role === "system" ? "System" : "Message";
      const text = String(message.content_text || "").trim();
      if (!text) return "";
      return `[${label}]\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function pickFirstMessage(messages, role) {
  const wanted = role === "assistant" ? "assistant" : "user";
  const found = (messages || []).find((message) => normalizeRole(message.role) === wanted && String(message.content_text || "").trim());
  return String(found?.content_text || "").trim();
}

async function getImportedConversationWithMessages(importedConversationId) {
  const [conversationRows] = await pool.query(
    `SELECT *
     FROM raw_imported_conversations
     WHERE id = ?
     LIMIT 1`,
    [importedConversationId]
  );

  const conversation = conversationRows[0] || null;
  if (!conversation) return null;

  const [messageRows] = await pool.query(
    `SELECT id, role, content_text, message_order, source_message_id, source_created_at
     FROM imported_conversation_messages
     WHERE imported_conversation_id = ?
     ORDER BY message_order ASC, id ASC`,
    [importedConversationId]
  );

  return {
    conversation,
    messages: messageRows || []
  };
}

async function createConversationLogFromImport(conversation, messages) {
  const rawText = conversation.normalized_text || buildMessagesText(messages) || conversation.title || "Imported conversation";
  const userMessage = pickFirstMessage(messages, "user") || rawText.slice(0, 4000);
  const assistantMessage = pickFirstMessage(messages, "assistant") || "Imported conversation queued for summary.";
  const sessionId = conversation.session_id || `imported-${conversation.id}`;

  const [result] = await pool.query(
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
      conversation.project_code || "rbs_ai_memory",
      sessionId,
      conversation.source_platform || "chatgpt",
      conversation.title || "Imported Conversation",
      userMessage,
      assistantMessage,
      rawText,
      "Pending imported conversation summary",
      "imported-export",
      0,
      "active"
    ]
  );

  return Number(result.insertId);
}

async function createSummaryQueueItem(conversationLogId, conversation, options = {}) {
  const [result] = await pool.query(
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
      conversation.project_code || options.project_code || "rbs_ai_memory",
      conversation.source_platform || "chatgpt",
      options.summary_model || "gpt-4o-mini",
      "pending",
      Number(options.priority || 4)
    ]
  );

  return Number(result.insertId);
}

async function linkImportedConversation(importedConversationId, conversationLogId, summaryQueueId) {
  await pool.query(
    `UPDATE raw_imported_conversations
     SET summary_queue_id = ?,
         import_status = 'queued_for_summary',
         review_status = CASE WHEN review_status = 'pending_review' THEN 'queued' ELSE review_status END,
         notes = CONCAT(COALESCE(notes, ''), '\nPhase 15-3 queued for summary at ', NOW())
     WHERE id = ?`,
    [summaryQueueId, importedConversationId]
  );

  await pool.query(
    `INSERT INTO imported_conversation_links (
       imported_conversation_id,
       link_type,
       target_table,
       target_id,
       target_key,
       notes
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      importedConversationId,
      "conversation_log",
      "ai_conversation_logs",
      conversationLogId,
      String(conversationLogId),
      "Phase 15-3 generated conversation log from imported conversation."
    ]
  );

  await pool.query(
    `INSERT INTO imported_conversation_links (
       imported_conversation_id,
       link_type,
       target_table,
       target_id,
       target_key,
       notes
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      importedConversationId,
      "summary_queue",
      "ai_summary_queue",
      summaryQueueId,
      String(summaryQueueId),
      "Phase 15-3 queued imported conversation for summary worker."
    ]
  );
}

async function queueImportedConversationsForSummary(options = {}) {
  await importedConversationService.ensureImportedConversationTables();

  const limit = Math.max(1, Math.min(Number(options.limit || 3), 100));
  const projectCode = options.project_code || null;

  const params = [];
  let projectFilter = "";
  if (projectCode) {
    projectFilter = " AND project_code = ?";
    params.push(projectCode);
  }
  params.push(limit);

  const [rows] = await pool.query(
    `SELECT id
     FROM raw_imported_conversations
     WHERE COALESCE(summary_queue_id, 0) = 0
       AND import_status IN ('imported', 'queued_failed', 'completed')
       ${projectFilter}
     ORDER BY source_updated_at DESC, imported_at DESC, id DESC
     LIMIT ?`,
    params
  );

  const results = [];

  for (const row of rows) {
    try {
      const payload = await getImportedConversationWithMessages(row.id);
      if (!payload) throw new Error(`Imported conversation not found: ${row.id}`);

      const conversationLogId = await createConversationLogFromImport(payload.conversation, payload.messages);
      const summaryQueueId = await createSummaryQueueItem(conversationLogId, payload.conversation, options);
      await linkImportedConversation(payload.conversation.id, conversationLogId, summaryQueueId);

      results.push({
        imported_conversation_id: payload.conversation.id,
        conversation_log_id: conversationLogId,
        summary_queue_id: summaryQueueId,
        status: "QUEUED"
      });
    } catch (error) {
      await pool.query(
        `UPDATE raw_imported_conversations
         SET import_status = 'queued_failed',
             notes = CONCAT(COALESCE(notes, ''), '\nPhase 15-3 queue failed at ', NOW(), ': ', ?)
         WHERE id = ?`,
        [String(error.message || error).slice(0, 500), row.id]
      );

      results.push({
        imported_conversation_id: row.id,
        status: "FAILED",
        error: error.message
      });
    }
  }

  const queued = results.filter((item) => item.status === "QUEUED").length;
  const failed = results.filter((item) => item.status === "FAILED").length;

  return {
    ok: failed === 0,
    phase: "15-3",
    action: "queue_imported_conversations_for_summary",
    checked_at: nowIso(),
    requested_limit: limit,
    selected_count: rows.length,
    queued_count: queued,
    failed_count: failed,
    results,
    status: await getSummaryQueueLinkStatus(),
    next_command: queued > 0 ? "npm run worker:summary" : null
  };
}

async function runSummaryQueueLinkTest(options = {}) {
  const status = await getSummaryQueueLinkStatus();
  const requiredFailures = (status.checklist || []).filter((item) => item.required && item.status === "FAIL");

  if (options.scenario === "queue_test") {
    return queueImportedConversationsForSummary({
      ...options,
      limit: options.limit || 1
    });
  }

  return {
    ok: requiredFailures.length === 0,
    phase: "15-3",
    test_status: requiredFailures.length === 0 ? "PASS" : "FAIL",
    scenario: options.scenario || "current",
    status,
    required_failures: requiredFailures
  };
}

module.exports = {
  getSummaryQueueLinkStatus,
  queueImportedConversationsForSummary,
  runSummaryQueueLinkTest
};
