const pool = require("../config/db");
const importedConversationService = require("./imported-conversation.service");

function nowIso() {
  return new Date().toISOString();
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

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function countRows(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return Number(rows[0]?.count || 0);
}

function buildChecklist(status = {}) {
  const tables = status.tables || {};
  const counts = status.counts || {};
  return [
    {
      key: "import_storage_ready",
      group: "storage",
      label: "Imported conversation storage tables are ready.",
      required: true,
      status: tables.raw_imported_conversations && tables.imported_conversation_messages ? "PASS" : "FAIL"
    },
    {
      key: "summary_queue_link_ready",
      group: "link",
      label: "Summary queue and imported conversation links are available.",
      required: true,
      status: tables.ai_summary_queue && tables.imported_conversation_links ? "PASS" : "FAIL"
    },
    {
      key: "ai_memory_ready",
      group: "memory",
      label: "ai_memory table is available for completed imported memory lookup.",
      required: true,
      status: tables.ai_memory ? "PASS" : "FAIL"
    },
    {
      key: "searchable_imports_available",
      group: "search",
      label: "There are imported conversations available for search.",
      required: false,
      status: Number(counts.imported_conversations || 0) > 0 ? "PASS" : "EMPTY"
    },
    {
      key: "queued_or_completed_available",
      group: "search",
      label: "There are imported conversations queued or linked to memory.",
      required: false,
      status: Number(counts.queued_imports || 0) + Number(counts.completed_imports || 0) > 0 ? "PASS" : "EMPTY"
    },
    {
      key: "keyword_search_ready",
      group: "search",
      label: "Keyword search can scan title, normalized text, and imported messages.",
      required: true,
      status: tables.raw_imported_conversations && tables.imported_conversation_messages ? "PASS" : "FAIL"
    }
  ];
}

async function getImportMemorySearchStatus() {
  await importedConversationService.ensureImportedConversationTables();

  const tables = {
    raw_imported_conversations: await tableExists("raw_imported_conversations"),
    imported_conversation_messages: await tableExists("imported_conversation_messages"),
    imported_conversation_links: await tableExists("imported_conversation_links"),
    ai_summary_queue: await tableExists("ai_summary_queue"),
    ai_memory: await tableExists("ai_memory")
  };

  const columns = {
    raw_summary_queue_id: tables.raw_imported_conversations ? await columnExists("raw_imported_conversations", "summary_queue_id") : false,
    raw_memory_id: tables.raw_imported_conversations ? await columnExists("raw_imported_conversations", "memory_id") : false
  };

  const counts = {
    imported_conversations: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations`) : 0,
    imported_messages: tables.imported_conversation_messages ? await countRows(`SELECT COUNT(*) AS count FROM imported_conversation_messages`) : 0,
    queued_imports: tables.raw_imported_conversations && columns.raw_summary_queue_id
      ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE COALESCE(summary_queue_id, 0) > 0`)
      : 0,
    completed_imports: tables.raw_imported_conversations && columns.raw_memory_id
      ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE COALESCE(memory_id, 0) > 0`)
      : 0,
    import_links: tables.imported_conversation_links ? await countRows(`SELECT COUNT(*) AS count FROM imported_conversation_links`) : 0
  };

  const requiredReady = tables.raw_imported_conversations && tables.imported_conversation_messages && tables.imported_conversation_links && tables.ai_summary_queue && tables.ai_memory;
  const status = {
    ok: requiredReady,
    phase: "15-4",
    checked_at: nowIso(),
    search_status: requiredReady ? "READY" : "ACTION_REQUIRED",
    tables,
    columns,
    counts
  };

  return {
    ...status,
    checklist: buildChecklist(status),
    default_filters: {
      project_code: "rbs_ai_memory",
      source_platform: "chatgpt",
      keyword: "",
      memory_status: "all",
      limit: 20
    },
    next_actions: [
      "Run a small keyword search from the Admin Console.",
      "Use project_code to separate AI Memory Gateway, rbs-homes, CRM, and SNS automation imports.",
      "After Phase 15-5, extend the source_platform filter to gemini and claude."
    ]
  };
}

function normalizeLimit(value) {
  const n = Number(value || 20);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(n, 100);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function statusWhereClause(memoryStatus, params) {
  const value = normalizeText(memoryStatus || "all").toLowerCase();
  if (value === "unqueued") return " AND COALESCE(ric.summary_queue_id, 0) = 0";
  if (value === "queued") return " AND COALESCE(ric.summary_queue_id, 0) > 0 AND COALESCE(ric.memory_id, 0) = 0";
  if (value === "completed" || value === "memory") return " AND COALESCE(ric.memory_id, 0) > 0";
  if (value === "failed") return " AND ric.import_status LIKE '%failed%'";
  return "";
}

async function searchImportedMemories(options = {}) {
  await importedConversationService.ensureImportedConversationTables();
  const status = await getImportMemorySearchStatus();
  if (!status.ok) {
    return {
      ok: false,
      phase: "15-4",
      search_status: "ACTION_REQUIRED",
      message: "Import memory search prerequisites are not ready.",
      status
    };
  }

  const keyword = normalizeText(options.keyword);
  const projectCode = normalizeText(options.project_code);
  const sourcePlatform = normalizeText(options.source_platform);
  const memoryStatus = normalizeText(options.memory_status || "all");
  const limit = normalizeLimit(options.limit);
  const params = [];
  const where = [];

  if (projectCode) {
    where.push("ric.project_code = ?");
    params.push(projectCode);
  }
  if (sourcePlatform) {
    where.push("ric.source_platform = ?");
    params.push(sourcePlatform);
  }
  if (keyword) {
    const like = `%${keyword}%`;
    where.push(`(
      ric.title LIKE ?
      OR ric.normalized_text LIKE ?
      OR ric.source_conversation_id LIKE ?
      OR EXISTS (
        SELECT 1
        FROM imported_conversation_messages icm
        WHERE icm.imported_conversation_id = ric.id
          AND icm.content_text LIKE ?
      )
    )`);
    params.push(like, like, like, like);
  }

  let sql = `
    SELECT
      ric.id,
      ric.batch_id,
      ric.source_platform,
      ric.source_conversation_id,
      ric.project_code,
      ric.session_id,
      ric.title,
      ric.import_status,
      ric.message_count,
      ric.source_created_at,
      ric.source_updated_at,
      ric.imported_at,
      ric.summary_queue_id,
      ric.memory_id,
      LEFT(ric.normalized_text, 900) AS preview_text,
      (
        SELECT COUNT(*)
        FROM imported_conversation_messages icm
        WHERE icm.imported_conversation_id = ric.id
      ) AS stored_message_count,
      (
        SELECT GROUP_CONCAT(DISTINCT link_type ORDER BY link_type SEPARATOR ',')
        FROM imported_conversation_links icl
        WHERE icl.imported_conversation_id = ric.id
      ) AS link_types
    FROM raw_imported_conversations ric
    WHERE 1 = 1
  `;

  if (where.length) sql += ` AND ${where.join(" AND ")}`;
  sql += statusWhereClause(memoryStatus, params);
  sql += ` ORDER BY ric.imported_at DESC, ric.id DESC LIMIT ?`;
  params.push(limit);

  const [rows] = await pool.query(sql, params);

  return {
    ok: true,
    phase: "15-4",
    searched_at: nowIso(),
    search_status: "PASS",
    filters: { keyword, project_code: projectCode, source_platform: sourcePlatform, memory_status: memoryStatus, limit },
    result_count: rows.length,
    results: rows.map((row) => ({
      id: row.id,
      batch_id: row.batch_id,
      source_platform: row.source_platform,
      source_conversation_id: row.source_conversation_id,
      project_code: row.project_code,
      session_id: row.session_id,
      title: row.title,
      import_status: row.import_status,
      message_count: row.message_count,
      stored_message_count: Number(row.stored_message_count || 0),
      source_created_at: row.source_created_at,
      source_updated_at: row.source_updated_at,
      imported_at: row.imported_at,
      summary_queue_id: row.summary_queue_id,
      memory_id: row.memory_id,
      link_types: row.link_types || "",
      preview_text: row.preview_text || ""
    }))
  };
}

async function runImportMemorySearchTest(options = {}) {
  const status = await getImportMemorySearchStatus();
  const requiredFailed = (status.checklist || []).filter((item) => item.required && item.status === "FAIL");
  if (requiredFailed.length) {
    return {
      ok: false,
      phase: "15-4",
      test_status: "FAIL",
      failed_items: requiredFailed,
      status
    };
  }

  const sampleSearch = await searchImportedMemories({
    project_code: options.project_code || "rbs_ai_memory",
    source_platform: options.source_platform || "chatgpt",
    keyword: options.keyword || "",
    memory_status: options.memory_status || "all",
    limit: options.limit || 5
  });

  return {
    ok: true,
    phase: "15-4",
    tested_at: nowIso(),
    test_status: "PASS",
    search_status: status.search_status,
    sample_result_count: sampleSearch.result_count || 0,
    status,
    sample_search: sampleSearch,
    phase15_5_entry_allowed: true
  };
}

module.exports = {
  getImportMemorySearchStatus,
  searchImportedMemories,
  runImportMemorySearchTest
};
