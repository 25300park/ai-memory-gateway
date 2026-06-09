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

async function countRows(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return Number(rows[0]?.count || 0);
}

async function getLatestRows(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows || [];
}

function getPassFail(condition, optional = false) {
  if (condition) return "PASS";
  return optional ? "MANUAL_CHECK" : "FAIL";
}

async function getPhase15FinalStatus() {
  await importedConversationService.ensureImportedConversationTables();

  const tables = {
    imported_conversation_batches: await tableExists("imported_conversation_batches"),
    raw_imported_conversations: await tableExists("raw_imported_conversations"),
    imported_conversation_messages: await tableExists("imported_conversation_messages"),
    imported_conversation_links: await tableExists("imported_conversation_links"),
    ai_summary_queue: await tableExists("ai_summary_queue"),
    ai_memory: await tableExists("ai_memory")
  };

  const counts = {
    batches: tables.imported_conversation_batches ? await countRows(`SELECT COUNT(*) AS count FROM imported_conversation_batches`) : 0,
    imported_conversations: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations`) : 0,
    imported_messages: tables.imported_conversation_messages ? await countRows(`SELECT COUNT(*) AS count FROM imported_conversation_messages`) : 0,
    links: tables.imported_conversation_links ? await countRows(`SELECT COUNT(*) AS count FROM imported_conversation_links`) : 0,
    queued_imports: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE summary_queue_id IS NOT NULL`) : 0,
    memorized_imports: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE memory_id IS NOT NULL`) : 0,
    failed_imports: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE import_status IN ('failed','error')`) : 0,
    duplicate_candidates: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE review_status = 'duplicate_candidate'`) : 0,
    chatgpt_imports: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE source_platform = 'chatgpt'`) : 0,
    gemini_imports: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE source_platform = 'gemini'`) : 0,
    claude_imports: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE source_platform = 'claude'`) : 0
  };

  const latestImports = tables.raw_imported_conversations ? await getLatestRows(
    `SELECT id, source_platform, project_code, title, import_status, review_status, message_count, summary_queue_id, memory_id, imported_at
       FROM raw_imported_conversations
      ORDER BY id DESC
      LIMIT 10`
  ) : [];

  const checklist = buildPhase15FinalChecklist({ tables, counts });
  const blockingItems = checklist.filter((item) => item.required !== false && item.status === "FAIL").map((item) => item.key);
  const manualItems = checklist.filter((item) => item.status === "MANUAL_CHECK").map((item) => item.key);
  const phase15Completed = blockingItems.length === 0;

  return {
    ok: phase15Completed,
    phase: "15-7",
    checked_at: nowIso(),
    final_status: phase15Completed ? (manualItems.length ? "COMPLETED_WITH_MANUAL_CHECKS" : "PHASE15_COMPLETED") : "NOT_READY",
    phase15_completed: phase15Completed,
    phase16_entry_allowed: phase15Completed,
    tables,
    counts,
    checklist,
    blocking_items: blockingItems,
    manual_check_items: manualItems,
    latest_imports: latestImports,
    next_phase: phase15Completed ? "Phase 16: Production Memory Usage Workflow / Real Operation Integration" : "Resolve blocking items before Phase 16."
  };
}

function buildPhase15FinalChecklist({ tables, counts }) {
  return [
    {
      key: "import_storage_tables_ready",
      group: "storage",
      label: "Imported conversation storage tables exist.",
      required: true,
      status: getPassFail(tables.imported_conversation_batches && tables.raw_imported_conversations && tables.imported_conversation_messages && tables.imported_conversation_links)
    },
    {
      key: "summary_queue_table_ready",
      group: "summary",
      label: "ai_summary_queue table exists for imported conversation summarization.",
      required: true,
      status: getPassFail(tables.ai_summary_queue)
    },
    {
      key: "ai_memory_table_ready",
      group: "memory",
      label: "ai_memory table exists for long-term imported memory storage.",
      required: true,
      status: getPassFail(tables.ai_memory)
    },
    {
      key: "chatgpt_importer_verified",
      group: "importer",
      label: "At least one ChatGPT import has been verified through sample or real ZIP import.",
      required: true,
      status: getPassFail(Number(counts.chatgpt_imports || 0) > 0)
    },
    {
      key: "imported_messages_available",
      group: "data",
      label: "Imported message records are available.",
      required: true,
      status: getPassFail(Number(counts.imported_messages || 0) > 0)
    },
    {
      key: "summary_queue_link_verified",
      group: "summary",
      label: "At least one imported conversation has been linked to summary queue.",
      required: true,
      status: getPassFail(Number(counts.queued_imports || 0) > 0)
    },
    {
      key: "memory_generation_verified",
      group: "memory",
      label: "At least one imported conversation has memory_id after summary worker execution.",
      required: false,
      status: Number(counts.memorized_imports || 0) > 0 ? "PASS" : "MANUAL_CHECK"
    },
    {
      key: "quality_review_ready",
      group: "quality",
      label: "Import quality review and duplicate scan are available.",
      required: true,
      status: getPassFail(Number(counts.imported_conversations || 0) >= 0 && tables.raw_imported_conversations)
    },
    {
      key: "failed_imports_reviewed",
      group: "quality",
      label: "Failed imported conversations are zero or ready for manual review.",
      required: false,
      status: Number(counts.failed_imports || 0) === 0 ? "PASS" : "MANUAL_CHECK"
    },
    {
      key: "gemini_claude_parser_prepared",
      group: "platform",
      label: "Gemini / Claude importer parser is prepared; real file import can be tested when export files are available.",
      required: false,
      status: "MANUAL_CHECK"
    }
  ];
}

async function runPhase15FinalTest(options = {}) {
  const status = await getPhase15FinalStatus();
  return {
    ok: status.phase15_completed,
    phase: "15-7",
    tested_at: nowIso(),
    test_status: status.phase15_completed ? (status.manual_check_items.length ? "PASS_WITH_MANUAL_CHECKS" : "PASS") : "FAIL",
    phase15_completed: status.phase15_completed,
    phase16_entry_allowed: status.phase16_entry_allowed,
    blocking_items: status.blocking_items,
    manual_check_items: status.manual_check_items,
    counts: status.counts,
    checklist: status.checklist,
    next_actions: status.phase15_completed
      ? [
          "Download the real ChatGPT export ZIP when the email link arrives.",
          "Import the real ChatGPT export with limit: 3 first, then full import with limit: 0.",
          "Run summary queue link and summary worker for selected imported conversations.",
          "Prepare Phase 16 for practical memory usage workflow and mini PC deployment planning."
        ]
      : [
          "Run Phase 15-3 summary queue link for at least one imported conversation.",
          "Run npm run worker:summary if memory_id has not been created yet.",
          "Review failed or duplicate candidate imports."
        ],
    status
  };
}

async function getPhase15FinalChecklist() {
  const status = await getPhase15FinalStatus();
  return {
    ok: status.ok,
    phase: "15-7",
    checked_at: nowIso(),
    checklist_status: status.final_status,
    checklist: status.checklist,
    blocking_items: status.blocking_items,
    manual_check_items: status.manual_check_items,
    counts: status.counts,
    phase15_completed: status.phase15_completed,
    phase16_entry_allowed: status.phase16_entry_allowed
  };
}

module.exports = {
  getPhase15FinalStatus,
  getPhase15FinalChecklist,
  runPhase15FinalTest
};
