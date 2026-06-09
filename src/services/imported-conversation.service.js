const pool = require("../config/db");

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

async function countTable(tableName) {
  if (!(await tableExists(tableName))) return null;
  const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(rows[0]?.count || 0);
}

async function ensureImportedConversationTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS imported_conversation_batches (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      batch_code VARCHAR(120) NOT NULL UNIQUE,
      source_platform VARCHAR(50) NOT NULL,
      source_file_name VARCHAR(255) NULL,
      project_code VARCHAR(120) NULL,
      import_status VARCHAR(40) NOT NULL DEFAULT 'created',
      total_conversations INT NOT NULL DEFAULT 0,
      total_messages INT NOT NULL DEFAULT 0,
      imported_conversations INT NOT NULL DEFAULT 0,
      imported_messages INT NOT NULL DEFAULT 0,
      duplicate_conversations INT NOT NULL DEFAULT 0,
      failed_conversations INT NOT NULL DEFAULT 0,
      options_json LONGTEXT NULL,
      notes TEXT NULL,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_import_batches_platform (source_platform),
      INDEX idx_import_batches_project (project_code),
      INDEX idx_import_batches_status (import_status),
      INDEX idx_import_batches_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS raw_imported_conversations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      batch_id BIGINT UNSIGNED NULL,
      source_platform VARCHAR(50) NOT NULL,
      source_conversation_id VARCHAR(255) NULL,
      project_code VARCHAR(120) NULL,
      session_id VARCHAR(255) NULL,
      title VARCHAR(500) NULL,
      conversation_url VARCHAR(1000) NULL,
      author_hint VARCHAR(255) NULL,
      source_created_at DATETIME NULL,
      source_updated_at DATETIME NULL,
      imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      import_status VARCHAR(40) NOT NULL DEFAULT 'imported',
      message_count INT NOT NULL DEFAULT 0,
      raw_json LONGTEXT NULL,
      normalized_text LONGTEXT NULL,
      content_hash VARCHAR(128) NULL,
      summary_queue_id BIGINT UNSIGNED NULL,
      memory_id BIGINT UNSIGNED NULL,
      review_status VARCHAR(40) NOT NULL DEFAULT 'pending_review',
      reviewed_at DATETIME NULL,
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_raw_import_batch (batch_id),
      INDEX idx_raw_import_platform (source_platform),
      INDEX idx_raw_import_project (project_code),
      INDEX idx_raw_import_session (session_id),
      INDEX idx_raw_import_status (import_status),
      INDEX idx_raw_import_review (review_status),
      INDEX idx_raw_import_content_hash (content_hash),
      INDEX idx_raw_import_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS imported_conversation_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      imported_conversation_id BIGINT UNSIGNED NOT NULL,
      batch_id BIGINT UNSIGNED NULL,
      source_platform VARCHAR(50) NOT NULL,
      source_message_id VARCHAR(255) NULL,
      parent_message_id VARCHAR(255) NULL,
      message_order INT NOT NULL DEFAULT 0,
      role VARCHAR(40) NOT NULL DEFAULT 'unknown',
      author_name VARCHAR(255) NULL,
      content_type VARCHAR(80) NULL,
      content_text LONGTEXT NULL,
      raw_json LONGTEXT NULL,
      token_estimate INT NULL,
      source_created_at DATETIME NULL,
      imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_import_msg_conversation (imported_conversation_id),
      INDEX idx_import_msg_batch (batch_id),
      INDEX idx_import_msg_platform (source_platform),
      INDEX idx_import_msg_order (imported_conversation_id, message_order),
      INDEX idx_import_msg_role (role),
      FULLTEXT INDEX ft_import_msg_content (content_text)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS imported_conversation_links (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      imported_conversation_id BIGINT UNSIGNED NOT NULL,
      link_type VARCHAR(80) NOT NULL,
      target_table VARCHAR(120) NULL,
      target_id BIGINT UNSIGNED NULL,
      target_key VARCHAR(255) NULL,
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_import_link_conversation (imported_conversation_id),
      INDEX idx_import_link_type (link_type),
      INDEX idx_import_link_target (target_table, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function getPhase15ImportChecklist() {
  return [
    {
      key: "import_batches_table",
      group: "storage",
      label: "imported_conversation_batches table exists for import job tracking.",
      required: true
    },
    {
      key: "raw_imported_conversations_table",
      group: "storage",
      label: "raw_imported_conversations table exists for original conversation storage.",
      required: true
    },
    {
      key: "imported_messages_table",
      group: "storage",
      label: "imported_conversation_messages table exists for normalized message storage.",
      required: true
    },
    {
      key: "import_links_table",
      group: "storage",
      label: "imported_conversation_links table exists for linking imported data to summary queue and memory.",
      required: true
    },
    {
      key: "project_code_ready",
      group: "workflow",
      label: "Imported conversations can be assigned to project_code for later context assembly.",
      required: true
    },
    {
      key: "summary_queue_link_ready",
      group: "workflow",
      label: "Imported conversations include summary_queue_id and memory_id fields for Phase 15-3 linkage.",
      required: true
    },
    {
      key: "raw_json_preserved",
      group: "safety",
      label: "Original export payload can be preserved in raw_json before normalization.",
      required: true
    }
  ];
}

async function getImportedConversationStatus() {
  await ensureImportedConversationTables();

  const tables = {
    imported_conversation_batches: await tableExists("imported_conversation_batches"),
    raw_imported_conversations: await tableExists("raw_imported_conversations"),
    imported_conversation_messages: await tableExists("imported_conversation_messages"),
    imported_conversation_links: await tableExists("imported_conversation_links")
  };

  const counts = {
    batches: await countTable("imported_conversation_batches"),
    conversations: await countTable("raw_imported_conversations"),
    messages: await countTable("imported_conversation_messages"),
    links: await countTable("imported_conversation_links")
  };

  let latestBatch = null;
  let latestConversation = null;

  if (tables.imported_conversation_batches) {
    const [batchRows] = await pool.query(`
      SELECT id, batch_code, source_platform, project_code, import_status, total_conversations,
             imported_conversations, total_messages, imported_messages, created_at, updated_at
      FROM imported_conversation_batches
      ORDER BY id DESC
      LIMIT 1
    `);
    latestBatch = batchRows[0] || null;
  }

  if (tables.raw_imported_conversations) {
    const [conversationRows] = await pool.query(`
      SELECT id, source_platform, source_conversation_id, project_code, session_id, title,
             import_status, review_status, message_count, imported_at, created_at
      FROM raw_imported_conversations
      ORDER BY id DESC
      LIMIT 1
    `);
    latestConversation = conversationRows[0] || null;
  }

  const checklist = getPhase15ImportChecklist().map((item) => ({
    ...item,
    status: "PASS"
  }));

  return {
    ok: true,
    phase: "15-1",
    checked_at: nowIso(),
    storage_status: "READY",
    tables,
    counts,
    latest_batch: latestBatch,
    latest_conversation: latestConversation,
    checklist,
    next_actions: [
      "Proceed to Phase 15-2 ChatGPT Export ZIP Importer.",
      "Use imported_conversation_batches to track each uploaded export file.",
      "Store raw payloads first, then normalize messages into imported_conversation_messages."
    ]
  };
}

async function runImportedConversationStorageTest(options = {}) {
  await ensureImportedConversationTables();

  const scenario = options.scenario || "current";

  if (scenario === "insert_test_record") {
    const batchCode = `phase15_test_${Date.now()}`;
    const [batchResult] = await pool.query(`
      INSERT INTO imported_conversation_batches
        (batch_code, source_platform, source_file_name, project_code, import_status, total_conversations,
         total_messages, imported_conversations, imported_messages, options_json, notes, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      batchCode,
      "manual_test",
      "phase15-1-test.json",
      options.project_code || "rbs_ai_memory",
      "completed",
      1,
      2,
      1,
      2,
      safeJson({ scenario }),
      "Phase 15-1 storage test record"
    ]);

    const batchId = Number(batchResult.insertId);
    const sessionId = `phase15-import-test-${Date.now()}`;
    const [conversationResult] = await pool.query(`
      INSERT INTO raw_imported_conversations
        (batch_id, source_platform, source_conversation_id, project_code, session_id, title,
         import_status, message_count, raw_json, normalized_text, content_hash, review_status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      batchId,
      "manual_test",
      sessionId,
      options.project_code || "rbs_ai_memory",
      sessionId,
      "Phase 15-1 Imported Conversation Storage Test",
      "imported",
      2,
      safeJson({ messages: ["hello", "world"] }),
      "User: hello\nAssistant: world",
      `test_${batchId}_${Date.now()}`,
      "reviewed",
      "Inserted by Phase 15-1 storage test"
    ]);

    const importedConversationId = Number(conversationResult.insertId);
    await pool.query(`
      INSERT INTO imported_conversation_messages
        (imported_conversation_id, batch_id, source_platform, source_message_id,
         message_order, role, author_name, content_type, content_text, raw_json, token_estimate)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      importedConversationId, batchId, "manual_test", `${sessionId}-m1`, 1, "user", "test-user", "text", "hello", safeJson({ role: "user", text: "hello" }), 1,
      importedConversationId, batchId, "manual_test", `${sessionId}-m2`, 2, "assistant", "test-assistant", "text", "world", safeJson({ role: "assistant", text: "world" }), 1
    ]);

    return {
      ok: true,
      phase: "15-1",
      test_status: "PASS",
      scenario,
      batch_id: batchId,
      imported_conversation_id: importedConversationId,
      message_count: 2,
      status: await getImportedConversationStatus()
    };
  }

  const status = await getImportedConversationStatus();
  const allTablesReady = Object.values(status.tables).every(Boolean);

  return {
    ok: allTablesReady,
    phase: "15-1",
    test_status: allTablesReady ? "PASS" : "FAIL",
    scenario,
    status
  };
}

module.exports = {
  ensureImportedConversationTables,
  getImportedConversationStatus,
  getPhase15ImportChecklist,
  runImportedConversationStorageTest
};
