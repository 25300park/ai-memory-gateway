const pool = require("../config/db");
const importedConversationService = require("./imported-conversation.service");

function nowIso() {
  return new Date().toISOString();
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLimit(value, fallback = 20, max = 200) {
  const n = toInt(value, fallback);
  if (n <= 0) return fallback;
  return Math.min(n, max);
}

function normalizeText(value) {
  return String(value || "").trim();
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
  const columns = status.columns || {};
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
      key: "review_columns_ready",
      group: "schema",
      label: "review_status, content_hash, summary_queue_id, and memory_id columns are available.",
      required: true,
      status: columns.review_status && columns.content_hash && columns.summary_queue_id && columns.memory_id ? "PASS" : "FAIL"
    },
    {
      key: "imported_data_available",
      group: "data",
      label: "There are imported conversations to review.",
      required: false,
      status: Number(counts.total_imported_conversations || 0) > 0 ? "PASS" : "EMPTY"
    },
    {
      key: "duplicate_scan_ready",
      group: "quality",
      label: "Duplicate candidate scan can use content_hash and source_conversation_id.",
      required: true,
      status: columns.content_hash ? "PASS" : "FAIL"
    },
    {
      key: "summary_link_visibility",
      group: "quality",
      label: "Summary queue and memory link visibility is available.",
      required: true,
      status: columns.summary_queue_id && columns.memory_id ? "PASS" : "FAIL"
    },
    {
      key: "message_count_quality",
      group: "quality",
      label: "Imported message count consistency can be checked.",
      required: true,
      status: tables.imported_conversation_messages ? "PASS" : "FAIL"
    },
    {
      key: "failed_import_visibility",
      group: "quality",
      label: "Failed or incomplete imports can be filtered for review.",
      required: true,
      status: columns.review_status ? "PASS" : "FAIL"
    }
  ];
}

async function getImportQualityReviewStatus() {
  await importedConversationService.ensureImportedConversationTables();

  const tables = {
    imported_conversation_batches: await tableExists("imported_conversation_batches"),
    raw_imported_conversations: await tableExists("raw_imported_conversations"),
    imported_conversation_messages: await tableExists("imported_conversation_messages"),
    imported_conversation_links: await tableExists("imported_conversation_links"),
    ai_summary_queue: await tableExists("ai_summary_queue"),
    ai_memory: await tableExists("ai_memory")
  };

  const columns = {
    review_status: tables.raw_imported_conversations ? await columnExists("raw_imported_conversations", "review_status") : false,
    content_hash: tables.raw_imported_conversations ? await columnExists("raw_imported_conversations", "content_hash") : false,
    summary_queue_id: tables.raw_imported_conversations ? await columnExists("raw_imported_conversations", "summary_queue_id") : false,
    memory_id: tables.raw_imported_conversations ? await columnExists("raw_imported_conversations", "memory_id") : false,
    message_count: tables.raw_imported_conversations ? await columnExists("raw_imported_conversations", "message_count") : false
  };

  const counts = {
    total_batches: tables.imported_conversation_batches ? await countRows(`SELECT COUNT(*) AS count FROM imported_conversation_batches`) : 0,
    total_imported_conversations: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations`) : 0,
    total_imported_messages: tables.imported_conversation_messages ? await countRows(`SELECT COUNT(*) AS count FROM imported_conversation_messages`) : 0,
    pending_review: tables.raw_imported_conversations && columns.review_status ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE COALESCE(review_status, 'pending_review') = 'pending_review'`) : 0,
    duplicate_candidates: tables.raw_imported_conversations && columns.review_status ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE review_status = 'duplicate_candidate'`) : 0,
    queued_imports: tables.raw_imported_conversations && columns.summary_queue_id ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE COALESCE(summary_queue_id, 0) > 0`) : 0,
    completed_memory_links: tables.raw_imported_conversations && columns.memory_id ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE COALESCE(memory_id, 0) > 0`) : 0,
    failed_imports: tables.raw_imported_conversations ? await countRows(`SELECT COUNT(*) AS count FROM raw_imported_conversations WHERE import_status LIKE '%failed%'`) : 0,
    duplicate_hash_groups: tables.raw_imported_conversations && columns.content_hash ? await countRows(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT content_hash
        FROM raw_imported_conversations
        WHERE content_hash IS NOT NULL AND content_hash <> ''
        GROUP BY content_hash
        HAVING COUNT(*) > 1
      ) d
    `) : 0
  };

  const requiredReady = tables.raw_imported_conversations && tables.imported_conversation_messages && columns.review_status && columns.content_hash && columns.summary_queue_id && columns.memory_id;
  const status = {
    ok: requiredReady,
    phase: "15-6",
    checked_at: nowIso(),
    review_status: requiredReady ? "READY" : "ACTION_REQUIRED",
    tables,
    columns,
    counts
  };

  return {
    ...status,
    checklist: buildChecklist(status),
    default_filters: {
      project_code: "rbs_ai_memory",
      source_platform: "all",
      review_status: "all",
      limit: 20
    },
    next_actions: [
      "Run a quality review with limit 20.",
      "Run duplicate scan in dry_run mode first.",
      "If duplicate candidates are correct, run duplicate scan with dry_run=false to mark duplicates.",
      "After review, proceed to Phase 15-7 Import Final Checklist."
    ]
  };
}

function buildReviewWhere(options, params) {
  const where = [];
  const projectCode = normalizeText(options.project_code);
  const sourcePlatform = normalizeText(options.source_platform || "all").toLowerCase();
  const reviewStatus = normalizeText(options.review_status || "all").toLowerCase();
  const keyword = normalizeText(options.keyword);

  if (projectCode) {
    where.push("ric.project_code = ?");
    params.push(projectCode);
  }
  if (sourcePlatform && sourcePlatform !== "all") {
    where.push("ric.source_platform = ?");
    params.push(sourcePlatform);
  }
  if (reviewStatus && reviewStatus !== "all") {
    where.push("COALESCE(ric.review_status, 'pending_review') = ?");
    params.push(reviewStatus);
  }
  if (keyword) {
    const like = `%${keyword}%`;
    where.push(`(
      ric.title LIKE ?
      OR ric.normalized_text LIKE ?
      OR ric.source_conversation_id LIKE ?
      OR ric.content_hash LIKE ?
    )`);
    params.push(like, like, like, like);
  }
  return where.length ? ` AND ${where.join(" AND ")}` : "";
}

async function reviewImportedConversationQuality(options = {}) {
  const status = await getImportQualityReviewStatus();
  if (!status.ok) {
    return {
      ok: false,
      phase: "15-6",
      review_status: "ACTION_REQUIRED",
      message: "Import quality review prerequisites are not ready.",
      status
    };
  }

  const limit = normalizeLimit(options.limit, 20, 200);
  const params = [];
  const where = buildReviewWhere(options, params);

  const [rows] = await pool.query(
    `SELECT
       ric.id,
       ric.batch_id,
       ric.source_platform,
       ric.source_conversation_id,
       ric.project_code,
       ric.title,
       ric.import_status,
       COALESCE(ric.review_status, 'pending_review') AS review_status,
       ric.message_count,
       ric.summary_queue_id,
       ric.memory_id,
       ric.content_hash,
       ric.imported_at,
       LEFT(ric.normalized_text, 600) AS preview_text,
       (SELECT COUNT(*) FROM imported_conversation_messages icm WHERE icm.imported_conversation_id = ric.id) AS stored_message_count,
       (SELECT COUNT(*) FROM raw_imported_conversations dup WHERE dup.content_hash = ric.content_hash AND ric.content_hash IS NOT NULL AND ric.content_hash <> '') AS duplicate_count,
       CASE
         WHEN ric.import_status LIKE '%failed%' THEN 'FAILED_IMPORT'
         WHEN (SELECT COUNT(*) FROM raw_imported_conversations dup WHERE dup.content_hash = ric.content_hash AND ric.content_hash IS NOT NULL AND ric.content_hash <> '') > 1 THEN 'DUPLICATE_CANDIDATE'
         WHEN ric.message_count <> (SELECT COUNT(*) FROM imported_conversation_messages icm WHERE icm.imported_conversation_id = ric.id) THEN 'MESSAGE_COUNT_MISMATCH'
         WHEN COALESCE(ric.summary_queue_id, 0) = 0 THEN 'NOT_QUEUED'
         WHEN COALESCE(ric.memory_id, 0) = 0 THEN 'QUEUED_NOT_MEMORY'
         ELSE 'OK'
       END AS quality_status
     FROM raw_imported_conversations ric
     WHERE 1 = 1
     ${where}
     ORDER BY ric.imported_at DESC, ric.id DESC
     LIMIT ?`,
    [...params, limit]
  );

  const summary = rows.reduce((acc, row) => {
    const key = row.quality_status || "UNKNOWN";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    ok: true,
    phase: "15-6",
    checked_at: nowIso(),
    review_status: "READY",
    filters: {
      project_code: normalizeText(options.project_code),
      source_platform: normalizeText(options.source_platform || "all"),
      review_status: normalizeText(options.review_status || "all"),
      keyword: normalizeText(options.keyword),
      limit
    },
    summary,
    results_count: rows.length,
    results: rows
  };
}

async function scanDuplicateCandidates(options = {}) {
  const status = await getImportQualityReviewStatus();
  if (!status.ok) {
    return {
      ok: false,
      phase: "15-6",
      duplicate_scan_status: "ACTION_REQUIRED",
      message: "Duplicate scan prerequisites are not ready.",
      status
    };
  }

  const projectCode = normalizeText(options.project_code);
  const sourcePlatform = normalizeText(options.source_platform || "all").toLowerCase();
  const limit = normalizeLimit(options.limit, 20, 200);
  const dryRun = options.dry_run !== false;
  const params = [];
  let where = "WHERE content_hash IS NOT NULL AND content_hash <> ''";
  if (projectCode) {
    where += " AND project_code = ?";
    params.push(projectCode);
  }
  if (sourcePlatform && sourcePlatform !== "all") {
    where += " AND source_platform = ?";
    params.push(sourcePlatform);
  }

  const [groups] = await pool.query(
    `SELECT content_hash, COUNT(*) AS duplicate_count, MIN(id) AS first_id, MAX(imported_at) AS last_imported_at
     FROM raw_imported_conversations
     ${where}
     GROUP BY content_hash
     HAVING COUNT(*) > 1
     ORDER BY duplicate_count DESC, last_imported_at DESC
     LIMIT ?`,
    [...params, limit]
  );

  let markedCount = 0;
  if (!dryRun && groups.length) {
    const hashes = groups.map((g) => g.content_hash).filter(Boolean);
    if (hashes.length) {
      const placeholders = hashes.map(() => "?").join(",");
      const [result] = await pool.query(
        `UPDATE raw_imported_conversations
         SET review_status = 'duplicate_candidate',
             notes = CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE '\n' END, 'Marked duplicate candidate by Phase 15-6 at ', NOW())
         WHERE content_hash IN (${placeholders})`,
        hashes
      );
      markedCount = Number(result.affectedRows || 0);
    }
  }

  return {
    ok: true,
    phase: "15-6",
    checked_at: nowIso(),
    duplicate_scan_status: groups.length ? "DUPLICATES_FOUND" : "NO_DUPLICATES_FOUND",
    dry_run: dryRun,
    groups_count: groups.length,
    marked_count: markedCount,
    groups,
    next_action: dryRun ? "If the duplicate groups look correct, run again with dry_run=false." : "Review rows marked as duplicate_candidate."
  };
}

async function runImportQualityReviewTest(options = {}) {
  const status = await getImportQualityReviewStatus();
  const review = status.ok ? await reviewImportedConversationQuality({
    project_code: options.project_code || "rbs_ai_memory",
    source_platform: options.source_platform || "all",
    review_status: "all",
    limit: options.limit || 5
  }) : null;
  const duplicateScan = status.ok ? await scanDuplicateCandidates({
    project_code: options.project_code || "rbs_ai_memory",
    source_platform: options.source_platform || "all",
    dry_run: true,
    limit: 5
  }) : null;

  const requiredFailures = (status.checklist || []).filter((item) => item.required && item.status !== "PASS");
  const pass = status.ok && requiredFailures.length === 0;

  return {
    ok: pass,
    phase: "15-6",
    checked_at: nowIso(),
    test_status: pass ? "PASS" : "FAIL",
    phase15_7_entry_allowed: pass,
    status,
    review_sample: review,
    duplicate_scan_sample: duplicateScan,
    failed_items: requiredFailures.map((item) => item.key)
  };
}

module.exports = {
  getImportQualityReviewStatus,
  reviewImportedConversationQuality,
  scanDuplicateCandidates,
  runImportQualityReviewTest
};
