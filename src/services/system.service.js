const pool = require("../config/db");

async function getCount(tableName) {
  const allowedTables = new Set([
    "ai_projects",
    "ai_memory",
    "ai_recent_buffer",
    "ai_conversation_logs",
    "ai_summary_queue",
    "project_assets",
    "ai_model_profiles",
    "ai_router_rules",
    "ai_prompt_templates",
    "ai_context_sessions",
    "ai_embeddings",
    "ai_tasks",
    "ai_memory_links"
  ]);

  if (!allowedTables.has(tableName)) {
    throw new Error(`Table not allowed: ${tableName}`);
  }

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM ${tableName}`
  );

  return Number(rows[0].count || 0);
}

async function getSummaryQueueStatus() {
  const [rows] = await pool.query(
    `
    SELECT
      status,
      COUNT(*) AS count
    FROM ai_summary_queue
    GROUP BY status
    ORDER BY status
    `
  );

  return rows.map((row) => ({
    status: row.status,
    count: Number(row.count || 0)
  }));
}

async function getMemoryCountByProject() {
  const [rows] = await pool.query(
    `
    SELECT
      project_code,
      COUNT(*) AS count
    FROM ai_memory
    GROUP BY project_code
    ORDER BY count DESC
    `
  );

  return rows.map((row) => ({
    project_code: row.project_code,
    count: Number(row.count || 0)
  }));
}

async function getAssetCountByProject() {
  const [rows] = await pool.query(
    `
    SELECT
      project_code,
      COUNT(*) AS count
    FROM project_assets
    WHERE is_active = TRUE
    GROUP BY project_code
    ORDER BY count DESC
    `
  );

  return rows.map((row) => ({
    project_code: row.project_code,
    count: Number(row.count || 0)
  }));
}

async function getLatestMemory(limit = 5) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      memory_type,
      title,
      summary,
      tags,
      importance,
      created_at
    FROM ai_memory
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [Number(limit)]
  );

  return rows;
}

async function getLatestConversation(limit = 5) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      session_id,
      source_ai,
      conversation_title,
      LEFT(user_message, 200) AS user_preview,
      LEFT(assistant_message, 200) AS assistant_preview,
      created_at
    FROM ai_conversation_logs
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [Number(limit)]
  );

  return rows;
}


async function getLatestTimestamp(tableName) {
  const allowedTables = new Set([
    "ai_memory",
    "ai_conversation_logs"
  ]);

  if (!allowedTables.has(tableName)) {
    throw new Error(`Table not allowed: ${tableName}`);
  }

  const [rows] = await pool.query(
    `SELECT MAX(created_at) AS last_time FROM ${tableName}`
  );

  return rows[0]?.last_time || null;
}

function getQueueStatusCount(queueStatusRows, status) {
  const row = queueStatusRows.find((item) =>
    String(item.status || "").toLowerCase() === status
  );

  return Number(row?.count || 0);
}


async function ensureDailyHealthCheckTable() {
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS ai_daily_health_checks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      api_server_status VARCHAR(20) NOT NULL,
      db_connection_status VARCHAR(20) NOT NULL,
      failed_queue_count INT NOT NULL DEFAULT 0,
      pending_queue_count INT NOT NULL DEFAULT 0,
      recent_memory_count INT NOT NULL DEFAULT 0,
      total_memory_count INT NOT NULL DEFAULT 0,
      project_assets_count INT NOT NULL DEFAULT 0,
      conversation_logs_count INT NOT NULL DEFAULT 0,
      last_conversation_time DATETIME NULL,
      last_memory_time DATETIME NULL,
      overall_status VARCHAR(20) NOT NULL,
      warnings_json TEXT NULL,
      errors_json TEXT NULL,
      raw_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_checked_at (checked_at),
      INDEX idx_overall_status (overall_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeDateForMysql(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function saveDailyHealthCheck(healthCheck = null) {
  await ensureDailyHealthCheckTable();

  const data = healthCheck || await getDailyHealthCheck();

  const [result] = await pool.query(
    `
    INSERT INTO ai_daily_health_checks (
      checked_at,
      api_server_status,
      db_connection_status,
      failed_queue_count,
      pending_queue_count,
      recent_memory_count,
      total_memory_count,
      project_assets_count,
      conversation_logs_count,
      last_conversation_time,
      last_memory_time,
      overall_status,
      warnings_json,
      errors_json,
      raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizeDateForMysql(data.checked_at) || normalizeDateForMysql(new Date()),
      data.api_server?.status || "UNKNOWN",
      data.db_connection?.status || "UNKNOWN",
      Number(data.summary_queue?.failed_count || 0),
      Number(data.summary_queue?.pending_count || 0),
      Number(data.memory?.recent_memory_count || 0),
      Number(data.memory?.total_memory_count || 0),
      Number(data.project_assets?.count || 0),
      Number(data.conversation_logs?.total_count || 0),
      normalizeDateForMysql(data.conversation_logs?.last_conversation_time),
      normalizeDateForMysql(data.memory?.last_memory_time),
      data.overall_status || "UNKNOWN",
      JSON.stringify(data.warnings || []),
      JSON.stringify(data.errors || []),
      JSON.stringify(data)
    ]
  );

  return {
    ok: true,
    id: result.insertId,
    saved_at: new Date().toISOString(),
    health_check: data
  };
}

async function getDailyHealthCheckHistory(limit = 10) {
  await ensureDailyHealthCheckTable();

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

  const [rows] = await pool.query(
    `
    SELECT
      id,
      checked_at,
      api_server_status,
      db_connection_status,
      failed_queue_count,
      pending_queue_count,
      recent_memory_count,
      total_memory_count,
      project_assets_count,
      conversation_logs_count,
      last_conversation_time,
      last_memory_time,
      overall_status,
      warnings_json,
      errors_json,
      created_at
    FROM ai_daily_health_checks
    ORDER BY checked_at DESC, id DESC
    LIMIT ?
    `,
    [safeLimit]
  );

  return rows.map((row) => ({
    ...row,
    warnings: safeJsonArray(row.warnings_json),
    errors: safeJsonArray(row.errors_json)
  }));
}

function safeJsonArray(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function getDailyHealthCheck() {
  const checkedAt = new Date();

  const result = {
    ok: true,
    checked_at: checkedAt.toISOString(),
    api_server: {
      status: "GOOD",
      message: "API server is running"
    },
    db_connection: {
      status: "UNKNOWN",
      message: "DB connection has not been checked yet"
    },
    summary_queue: {
      failed_count: 0,
      pending_count: 0
    },
    memory: {
      recent_memory_count: 0,
      total_memory_count: 0,
      last_memory_time: null
    },
    project_assets: {
      count: 0
    },
    conversation_logs: {
      total_count: 0,
      last_conversation_time: null
    },
    overall_status: "GOOD",
    warnings: [],
    errors: [],
    save_ready: {
      table_name: "ai_daily_health_checks",
      enabled: true,
      message: "Phase 9-2 저장 기능이 준비되었습니다. Save Daily Check 버튼으로 현재 결과를 DB에 저장할 수 있습니다."
    }
  };

  try {
    await pool.query("SELECT 1 AS db_ok");

    result.db_connection.status = "GOOD";
    result.db_connection.message = "DB connection is healthy";

    const [
      queueStatusRows,
      recentMemoryCount,
      totalMemoryCount,
      projectAssetsCount,
      conversationLogsCount,
      lastConversationTime,
      lastMemoryTime
    ] = await Promise.all([
      getSummaryQueueStatus(),
      getCount("ai_recent_buffer"),
      getCount("ai_memory"),
      getCount("project_assets"),
      getCount("ai_conversation_logs"),
      getLatestTimestamp("ai_conversation_logs"),
      getLatestTimestamp("ai_memory")
    ]);

    result.summary_queue.failed_count = getQueueStatusCount(queueStatusRows, "failed");
    result.summary_queue.pending_count = getQueueStatusCount(queueStatusRows, "pending");
    result.memory.recent_memory_count = recentMemoryCount;
    result.memory.total_memory_count = totalMemoryCount;
    result.memory.last_memory_time = lastMemoryTime;
    result.project_assets.count = projectAssetsCount;
    result.conversation_logs.total_count = conversationLogsCount;
    result.conversation_logs.last_conversation_time = lastConversationTime;

    if (result.summary_queue.failed_count > 0) {
      result.overall_status = "ERROR";
      result.errors.push(
        `Failed summary queue exists: ${result.summary_queue.failed_count}`
      );
    }

    if (
      result.overall_status !== "ERROR" &&
      result.summary_queue.pending_count >= 10
    ) {
      result.overall_status = "WARNING";
      result.warnings.push(
        `Pending summary queue is high: ${result.summary_queue.pending_count}`
      );
    }

    if (
      result.overall_status !== "ERROR" &&
      result.memory.recent_memory_count === 0
    ) {
      result.overall_status = "WARNING";
      result.warnings.push("Recent memory buffer is empty");
    }

    if (
      result.overall_status !== "ERROR" &&
      result.project_assets.count === 0
    ) {
      result.overall_status = "WARNING";
      result.warnings.push("Project assets are empty");
    }

    return result;
  } catch (error) {
    result.ok = false;
    result.db_connection.status = "ERROR";
    result.db_connection.message = error.message;
    result.overall_status = "ERROR";
    result.errors.push(error.message);

    return result;
  }
}



const DEFAULT_DAILY_OPERATION_ITEMS = [
  {
    item_key: "run_health_check",
    item_group: "System",
    item_label: "Run Daily Health Check",
    sort_order: 10
  },
  {
    item_key: "save_health_check",
    item_group: "System",
    item_label: "Save Daily Health Check Result",
    sort_order: 20
  },
  {
    item_key: "review_failed_queue",
    item_group: "Queue",
    item_label: "Review Failed Summary Queue",
    sort_order: 30
  },
  {
    item_key: "review_pending_queue",
    item_group: "Queue",
    item_label: "Review Pending Summary Queue",
    sort_order: 40
  },
  {
    item_key: "review_recent_memory",
    item_group: "Memory",
    item_label: "Review Recent Memory Buffer",
    sort_order: 50
  },
  {
    item_key: "review_project_assets",
    item_group: "Project Assets",
    item_label: "Review Project Assets Count",
    sort_order: 60
  },
  {
    item_key: "review_last_conversation",
    item_group: "Conversation",
    item_label: "Check Last Conversation Time",
    sort_order: 70
  },
  {
    item_key: "record_operation_note",
    item_group: "Operation",
    item_label: "Record Daily Operation Note",
    sort_order: 80
  }
];

async function ensureDailyOperationChecklistTable() {
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS ai_daily_operation_checklists (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      check_date DATE NOT NULL,
      item_key VARCHAR(100) NOT NULL,
      item_group VARCHAR(100) NOT NULL,
      item_label VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_done TINYINT(1) NOT NULL DEFAULT 0,
      note TEXT NULL,
      completed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_daily_operation_item (check_date, item_key),
      INDEX idx_check_date (check_date),
      INDEX idx_is_done (is_done)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeCheckDate(value = null) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

async function seedDailyOperationChecklist(checkDate) {
  await ensureDailyOperationChecklistTable();

  for (const item of DEFAULT_DAILY_OPERATION_ITEMS) {
    await pool.query(
      `
      INSERT INTO ai_daily_operation_checklists (
        check_date,
        item_key,
        item_group,
        item_label,
        sort_order,
        is_done
      ) VALUES (?, ?, ?, ?, ?, 0)
      ON DUPLICATE KEY UPDATE
        item_group = VALUES(item_group),
        item_label = VALUES(item_label),
        sort_order = VALUES(sort_order)
      `,
      [
        checkDate,
        item.item_key,
        item.item_group,
        item.item_label,
        item.sort_order
      ]
    );
  }
}

function buildDailyOperationSummary(rows) {
  const total = rows.length;
  const done = rows.filter((row) => Number(row.is_done) === 1).length;
  const pending = total - done;
  const completion_rate = total > 0 ? Math.round((done / total) * 100) : 0;

  let overall_status = "PENDING";
  if (total > 0 && done === total) {
    overall_status = "DONE";
  } else if (done > 0) {
    overall_status = "IN_PROGRESS";
  }

  return {
    total,
    done,
    pending,
    completion_rate,
    overall_status
  };
}

async function getDailyOperationChecklist(checkDateValue = null) {
  const checkDate = normalizeCheckDate(checkDateValue);
  await seedDailyOperationChecklist(checkDate);

  const [rows] = await pool.query(
    `
    SELECT
      id,
      check_date,
      item_key,
      item_group,
      item_label,
      sort_order,
      is_done,
      note,
      completed_at,
      updated_at
    FROM ai_daily_operation_checklists
    WHERE check_date = ?
    ORDER BY sort_order ASC, id ASC
    `,
    [checkDate]
  );

  const normalizedRows = rows.map((row) => ({
    ...row,
    is_done: Number(row.is_done) === 1
  }));

  return {
    ok: true,
    check_date: checkDate,
    summary: buildDailyOperationSummary(normalizedRows),
    results: normalizedRows
  };
}

async function updateDailyOperationChecklistItem({
  check_date = null,
  item_key,
  is_done = false,
  note = null
}) {
  if (!item_key) {
    throw new Error("item_key is required.");
  }

  const checkDate = normalizeCheckDate(check_date);
  await seedDailyOperationChecklist(checkDate);

  const doneValue = is_done ? 1 : 0;
  const completedAt = doneValue ? normalizeDateForMysql(new Date()) : null;

  const [result] = await pool.query(
    `
    UPDATE ai_daily_operation_checklists
    SET
      is_done = ?,
      note = ?,
      completed_at = ?
    WHERE check_date = ?
      AND item_key = ?
    `,
    [
      doneValue,
      note,
      completedAt,
      checkDate,
      item_key
    ]
  );

  if (result.affectedRows === 0) {
    throw new Error(`Checklist item not found: ${item_key}`);
  }

  return getDailyOperationChecklist(checkDate);
}

async function resetDailyOperationChecklist(checkDateValue = null) {
  const checkDate = normalizeCheckDate(checkDateValue);
  await seedDailyOperationChecklist(checkDate);

  await pool.query(
    `
    UPDATE ai_daily_operation_checklists
    SET
      is_done = 0,
      note = NULL,
      completed_at = NULL
    WHERE check_date = ?
    `,
    [checkDate]
  );

  return getDailyOperationChecklist(checkDate);
}


// ======================================================
// Phase 9-5: Daily Operation Automation Scheduler Ready
// ======================================================
async function ensureDailyAutomationTables() {
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS ai_daily_operation_automation_settings (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
      is_enabled TINYINT(1) NOT NULL DEFAULT 0,
      run_time VARCHAR(5) NOT NULL DEFAULT '09:00',
      timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Manila',
      save_health_check TINYINT(1) NOT NULL DEFAULT 1,
      auto_mark_checklist TINYINT(1) NOT NULL DEFAULT 1,
      last_run_date DATE NULL,
      last_run_at DATETIME NULL,
      note TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await pool.query(
    `
    INSERT IGNORE INTO ai_daily_operation_automation_settings (
      id,
      is_enabled,
      run_time,
      timezone,
      save_health_check,
      auto_mark_checklist,
      note
    ) VALUES (1, 0, '09:00', 'Asia/Manila', 1, 1, 'Phase 9-5 scheduler setting is ready. Enable it after manual tests.')
    `
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS ai_daily_operation_automation_runs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      run_date DATE NOT NULL,
      run_type VARCHAR(30) NOT NULL DEFAULT 'manual',
      started_at DATETIME NOT NULL,
      finished_at DATETIME NULL,
      overall_status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
      health_check_id BIGINT UNSIGNED NULL,
      checklist_date DATE NULL,
      actions_json LONGTEXT NULL,
      errors_json LONGTEXT NULL,
      raw_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_run_date (run_date),
      INDEX idx_run_type (run_type),
      INDEX idx_overall_status (overall_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeRunTime(value) {
  const text = String(value || '').trim();
  if (/^\d{2}:\d{2}$/.test(text)) {
    const [hh, mm] = text.split(':').map(Number);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return text;
  }
  return '09:00';
}

function getTimezoneParts(timezone = 'Asia/Manila') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

async function getDailyAutomationConfig() {
  await ensureDailyAutomationTables();

  const [rows] = await pool.query(
    `
    SELECT
      id,
      is_enabled,
      run_time,
      timezone,
      save_health_check,
      auto_mark_checklist,
      last_run_date,
      last_run_at,
      note,
      updated_at
    FROM ai_daily_operation_automation_settings
    WHERE id = 1
    LIMIT 1
    `
  );

  const row = rows[0] || {};
  const timezone = row.timezone || 'Asia/Manila';
  const now = getTimezoneParts(timezone);

  return {
    ok: true,
    config: {
      is_enabled: Number(row.is_enabled || 0) === 1,
      run_time: row.run_time || '09:00',
      timezone,
      save_health_check: Number(row.save_health_check ?? 1) === 1,
      auto_mark_checklist: Number(row.auto_mark_checklist ?? 1) === 1,
      last_run_date: row.last_run_date || null,
      last_run_at: row.last_run_at || null,
      note: row.note || '',
      updated_at: row.updated_at || null
    },
    server_time: new Date().toISOString(),
    scheduler_time: now,
    next_action: Number(row.is_enabled || 0) === 1
      ? `Worker will run once per day at or after ${row.run_time || '09:00'} ${timezone}.`
      : 'Scheduler is disabled. Use Run Automation Now for manual testing.'
  };
}

async function updateDailyAutomationConfig(payload = {}) {
  await ensureDailyAutomationTables();

  const isEnabled = payload.is_enabled === true || payload.is_enabled === 1 || payload.is_enabled === '1' ? 1 : 0;
  const saveHealthCheck = payload.save_health_check === false || payload.save_health_check === 0 || payload.save_health_check === '0' ? 0 : 1;
  const autoMarkChecklist = payload.auto_mark_checklist === false || payload.auto_mark_checklist === 0 || payload.auto_mark_checklist === '0' ? 0 : 1;
  const runTime = normalizeRunTime(payload.run_time || '09:00');
  const timezone = String(payload.timezone || 'Asia/Manila').trim() || 'Asia/Manila';
  const note = payload.note == null ? null : String(payload.note);

  await pool.query(
    `
    UPDATE ai_daily_operation_automation_settings
    SET
      is_enabled = ?,
      run_time = ?,
      timezone = ?,
      save_health_check = ?,
      auto_mark_checklist = ?,
      note = ?
    WHERE id = 1
    `,
    [
      isEnabled,
      runTime,
      timezone,
      saveHealthCheck,
      autoMarkChecklist,
      note
    ]
  );

  return getDailyAutomationConfig();
}

async function runDailyOperationAutomation(options = {}) {
  await ensureDailyAutomationTables();

  const configResult = await getDailyAutomationConfig();
  const config = configResult.config;
  const runType = options.run_type || 'manual';
  const runDate = normalizeCheckDate(options.run_date || configResult.scheduler_time?.date || null);
  const startedAt = new Date();
  const actions = [];
  const errors = [];
  const lockKey = 'daily_operation_automation';
  const lockOwner = `automation:${runType}:${process.pid}`;

  const lock = await acquireSystemOperationLock({
    lock_key: lockKey,
    locked_by: lockOwner,
    ttl_minutes: 30,
    meta: {
      run_type: runType,
      requested_run_date: runDate,
      requested_at: new Date().toISOString()
    }
  });

  if (!lock.acquired) {
    await createOperationLog({
      log_level: 'WARNING',
      category: 'automation',
      action: 'daily_automation_lock_denied',
      message: 'Daily automation run was blocked because another run lock already exists.',
      actor: lockOwner,
      raw: lock
    });

    return {
      ok: false,
      run_id: null,
      run_date: runDate,
      run_type: runType,
      overall_status: 'WARNING',
      health_check_id: null,
      actions: [],
      errors: ['Daily automation is already running or locked.'],
      lock
    };
  }

  await createOperationLog({
    log_level: 'INFO',
    category: 'automation',
    action: 'daily_automation_started',
    message: `Daily automation started. run_type=${runType}, run_date=${runDate}`,
    actor: lockOwner,
    raw: { run_type: runType, run_date: runDate, config }
  });

  const [runInsert] = await pool.query(
    `
    INSERT INTO ai_daily_operation_automation_runs (
      run_date,
      run_type,
      started_at,
      overall_status,
      actions_json,
      errors_json
    ) VALUES (?, ?, ?, 'RUNNING', '[]', '[]')
    `,
    [runDate, runType, normalizeDateForMysql(startedAt)]
  );

  const runId = runInsert.insertId;
  let healthCheck = null;
  let savedHealthCheck = null;
  let checklist = null;
  let overallStatus = 'GOOD';

  try {
    healthCheck = await getDailyHealthCheck();
    actions.push('Daily Health Check executed.');

    if (config.save_health_check) {
      savedHealthCheck = await saveDailyHealthCheck(healthCheck);
      actions.push(`Daily Health Check saved. health_check_id=${savedHealthCheck.id}`);
    }

    if (config.auto_mark_checklist) {
      await updateDailyOperationChecklistItem({
        check_date: runDate,
        item_key: 'run_health_check',
        is_done: true,
        note: `Automation ${runType} run at ${startedAt.toISOString()}`
      });
      actions.push('Checklist item marked: run_health_check');

      if (savedHealthCheck?.id) {
        await updateDailyOperationChecklistItem({
          check_date: runDate,
          item_key: 'save_health_check',
          is_done: true,
          note: `Saved by automation. health_check_id=${savedHealthCheck.id}`
        });
        actions.push('Checklist item marked: save_health_check');
      }
    }

    checklist = await getDailyOperationChecklist(runDate);
    overallStatus = healthCheck.overall_status || 'GOOD';

    if (healthCheck.errors?.length) {
      errors.push(...healthCheck.errors);
    }

    await pool.query(
      `
      UPDATE ai_daily_operation_automation_settings
      SET
        last_run_date = ?,
        last_run_at = ?
      WHERE id = 1
      `,
      [runDate, normalizeDateForMysql(new Date())]
    );
  } catch (error) {
    overallStatus = 'ERROR';
    errors.push(error.message);
  }

  const raw = {
    run_id: runId,
    run_date: runDate,
    run_type: runType,
    config,
    health_check: healthCheck,
    saved_health_check: savedHealthCheck,
    checklist
  };

  await pool.query(
    `
    UPDATE ai_daily_operation_automation_runs
    SET
      finished_at = ?,
      overall_status = ?,
      health_check_id = ?,
      checklist_date = ?,
      actions_json = ?,
      errors_json = ?,
      raw_json = ?
    WHERE id = ?
    `,
    [
      normalizeDateForMysql(new Date()),
      overallStatus,
      savedHealthCheck?.id || null,
      runDate,
      JSON.stringify(actions),
      JSON.stringify(errors),
      JSON.stringify(raw),
      runId
    ]
  );

  await releaseSystemOperationLock(lockKey);

  await createOperationLog({
    log_level: errors.length ? 'ERROR' : 'INFO',
    category: 'automation',
    action: 'daily_automation_finished',
    message: `Daily automation finished. run_id=${runId}, status=${overallStatus}`,
    actor: lockOwner,
    ref_type: 'ai_daily_operation_automation_runs',
    ref_id: String(runId),
    raw: { run_id: runId, run_date: runDate, run_type: runType, overall_status: overallStatus, actions, errors }
  });

  return {
    ok: errors.length === 0,
    run_id: runId,
    run_date: runDate,
    run_type: runType,
    overall_status: overallStatus,
    health_check_id: savedHealthCheck?.id || null,
    actions,
    errors,
    health_check: healthCheck,
    checklist
  };
}

async function getDailyAutomationHistory(limit = 10) {
  await ensureDailyAutomationTables();

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

  const [rows] = await pool.query(
    `
    SELECT
      id,
      run_date,
      run_type,
      started_at,
      finished_at,
      overall_status,
      health_check_id,
      checklist_date,
      actions_json,
      errors_json,
      created_at
    FROM ai_daily_operation_automation_runs
    ORDER BY id DESC
    LIMIT ?
    `,
    [safeLimit]
  );

  return rows.map((row) => ({
    ...row,
    actions: safeJsonArray(row.actions_json),
    errors: safeJsonArray(row.errors_json)
  }));
}

async function shouldRunDailyAutomationNow() {
  const configResult = await getDailyAutomationConfig();
  const config = configResult.config;

  if (!config.is_enabled) {
    return {
      should_run: false,
      reason: 'Scheduler is disabled.',
      config: configResult
    };
  }

  const current = configResult.scheduler_time;
  if (String(config.last_run_date || '').slice(0, 10) === current.date) {
    return {
      should_run: false,
      reason: `Already ran today: ${current.date}`,
      config: configResult
    };
  }

  if (current.time < config.run_time) {
    return {
      should_run: false,
      reason: `Waiting for run_time ${config.run_time}. Current scheduler time is ${current.time}.`,
      config: configResult
    };
  }

  return {
    should_run: true,
    reason: `Ready to run. Current scheduler time is ${current.time}.`,
    config: configResult
  };
}



// ======================================================
// Phase 9-6: Operation Logs + Automation Safety Guard
// ======================================================
async function ensureOperationSafetyTables() {
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS ai_operation_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      log_level VARCHAR(20) NOT NULL DEFAULT 'INFO',
      category VARCHAR(80) NOT NULL DEFAULT 'system',
      action VARCHAR(120) NOT NULL,
      message TEXT NULL,
      actor VARCHAR(100) NULL,
      ref_type VARCHAR(80) NULL,
      ref_id VARCHAR(80) NULL,
      raw_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_log_level (log_level),
      INDEX idx_category (category),
      INDEX idx_action (action),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS ai_system_operation_locks (
      lock_key VARCHAR(100) NOT NULL PRIMARY KEY,
      locked_by VARCHAR(100) NOT NULL,
      locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      meta_json LONGTEXT NULL,
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeLogLevel(value = 'INFO') {
  const level = String(value || 'INFO').trim().toUpperCase();
  return ['DEBUG', 'INFO', 'WARNING', 'ERROR'].includes(level) ? level : 'INFO';
}

async function createOperationLog({
  log_level = 'INFO',
  category = 'system',
  action,
  message = null,
  actor = 'admin',
  ref_type = null,
  ref_id = null,
  raw = null
}) {
  await ensureOperationSafetyTables();

  if (!action) {
    throw new Error('action is required.');
  }

  const [result] = await pool.query(
    `
    INSERT INTO ai_operation_logs (
      log_level,
      category,
      action,
      message,
      actor,
      ref_type,
      ref_id,
      raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizeLogLevel(log_level),
      String(category || 'system').slice(0, 80),
      String(action).slice(0, 120),
      message == null ? null : String(message),
      actor == null ? null : String(actor).slice(0, 100),
      ref_type == null ? null : String(ref_type).slice(0, 80),
      ref_id == null ? null : String(ref_id).slice(0, 80),
      raw == null ? null : JSON.stringify(raw)
    ]
  );

  return {
    ok: true,
    id: result.insertId,
    created_at: new Date().toISOString()
  };
}

async function getOperationLogs({
  limit = 50,
  log_level = null,
  category = null,
  action = null
} = {}) {
  await ensureOperationSafetyTables();

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const where = [];
  const params = [];

  if (log_level && String(log_level).toLowerCase() !== 'all') {
    where.push('log_level = ?');
    params.push(normalizeLogLevel(log_level));
  }

  if (category && String(category).toLowerCase() !== 'all') {
    where.push('category = ?');
    params.push(String(category).slice(0, 80));
  }

  if (action) {
    where.push('action LIKE ?');
    params.push(`%${String(action).slice(0, 120)}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `
    SELECT
      id,
      log_level,
      category,
      action,
      message,
      actor,
      ref_type,
      ref_id,
      raw_json,
      created_at
    FROM ai_operation_logs
    ${whereSql}
    ORDER BY id DESC
    LIMIT ?
    `,
    [...params, safeLimit]
  );

  return rows.map((row) => ({
    ...row,
    raw: safeJsonObject(row.raw_json)
  }));
}

function safeJsonObject(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

async function cleanupOperationLogs({ older_than_days = 30, level = null } = {}) {
  await ensureOperationSafetyTables();

  const days = Math.min(Math.max(Number(older_than_days) || 30, 7), 3650);
  const params = [days];
  let levelSql = '';

  if (level && String(level).toLowerCase() !== 'all') {
    levelSql = 'AND log_level = ?';
    params.push(normalizeLogLevel(level));
  }

  const [result] = await pool.query(
    `
    DELETE FROM ai_operation_logs
    WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    ${levelSql}
    `,
    params
  );

  await createOperationLog({
    log_level: 'INFO',
    category: 'maintenance',
    action: 'operation_logs_cleanup',
    message: `Old operation logs cleaned. deleted_count=${result.affectedRows}, older_than_days=${days}`,
    raw: { deleted_count: result.affectedRows, older_than_days: days, level }
  });

  return {
    ok: true,
    deleted_count: result.affectedRows,
    older_than_days: days,
    level: level || 'all'
  };
}

async function acquireSystemOperationLock({
  lock_key,
  locked_by = 'system',
  ttl_minutes = 30,
  meta = null
}) {
  await ensureOperationSafetyTables();

  if (!lock_key) {
    throw new Error('lock_key is required.');
  }

  const ttl = Math.min(Math.max(Number(ttl_minutes) || 30, 1), 240);

  await pool.query(
    `DELETE FROM ai_system_operation_locks WHERE expires_at < NOW()`
  );

  try {
    await pool.query(
      `
      INSERT INTO ai_system_operation_locks (
        lock_key,
        locked_by,
        locked_at,
        expires_at,
        meta_json
      ) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)
      `,
      [lock_key, String(locked_by).slice(0, 100), ttl, meta == null ? null : JSON.stringify(meta)]
    );

    return {
      ok: true,
      acquired: true,
      lock_key,
      ttl_minutes: ttl
    };
  } catch (error) {
    if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
      const [rows] = await pool.query(
        `SELECT lock_key, locked_by, locked_at, expires_at, meta_json FROM ai_system_operation_locks WHERE lock_key = ? LIMIT 1`,
        [lock_key]
      );

      return {
        ok: false,
        acquired: false,
        lock_key,
        error: 'LOCK_ALREADY_EXISTS',
        lock: rows[0] || null
      };
    }

    throw error;
  }
}

async function releaseSystemOperationLock(lock_key = 'daily_operation_automation') {
  await ensureOperationSafetyTables();

  const [result] = await pool.query(
    `DELETE FROM ai_system_operation_locks WHERE lock_key = ?`,
    [lock_key]
  );

  return {
    ok: true,
    lock_key,
    released_count: result.affectedRows
  };
}

async function getAutomationSafetyStatus() {
  await ensureDailyAutomationTables();
  await ensureOperationSafetyTables();

  const [lockRows] = await pool.query(
    `
    SELECT lock_key, locked_by, locked_at, expires_at, meta_json
    FROM ai_system_operation_locks
    ORDER BY locked_at DESC
    `
  );

  const [runningRows] = await pool.query(
    `
    SELECT id, run_date, run_type, started_at, overall_status, created_at
    FROM ai_daily_operation_automation_runs
    WHERE overall_status = 'RUNNING'
    ORDER BY id DESC
    LIMIT 20
    `
  );

  const [recentErrorRows] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM ai_operation_logs
    WHERE log_level = 'ERROR'
      AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `
  );

  const [recentWarningRows] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM ai_operation_logs
    WHERE log_level = 'WARNING'
      AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `
  );

  const config = await getDailyAutomationConfig();
  const lockCount = lockRows.length;
  const runningCount = runningRows.length;
  const recentErrorCount = Number(recentErrorRows[0]?.count || 0);
  const recentWarningCount = Number(recentWarningRows[0]?.count || 0);

  let safetyStatus = 'GOOD';
  const warnings = [];
  const errors = [];

  if (lockCount > 0) {
    safetyStatus = 'WARNING';
    warnings.push(`Active operation lock exists: ${lockCount}`);
  }

  if (runningCount > 0) {
    safetyStatus = 'WARNING';
    warnings.push(`Running automation record exists: ${runningCount}`);
  }

  if (recentErrorCount > 0) {
    safetyStatus = 'ERROR';
    errors.push(`Recent operation errors in 24 hours: ${recentErrorCount}`);
  }

  return {
    ok: true,
    safety_status: safetyStatus,
    checked_at: new Date().toISOString(),
    active_locks: lockRows.map((row) => ({
      ...row,
      meta: safeJsonObject(row.meta_json)
    })),
    running_automation_runs: runningRows,
    recent_24h: {
      errors: recentErrorCount,
      warnings: recentWarningCount
    },
    config: config.config,
    warnings,
    errors
  };
}



const DEFAULT_PHASE9_FINAL_ITEMS = [
  { item_key: "phase9_1_daily_health_check", item_group: "Phase 9-1", item_label: "Daily Health Check screen and API completed", sort_order: 10 },
  { item_key: "phase9_2_health_history", item_group: "Phase 9-2", item_label: "Daily Health Check DB save and history completed", sort_order: 20 },
  { item_key: "phase9_3_operation_checklist", item_group: "Phase 9-3", item_label: "Daily Operation Checklist completed", sort_order: 30 },
  { item_key: "phase9_4_queue_retry", item_group: "Phase 9-4", item_label: "Failed Queue retry and queue stabilization completed", sort_order: 40 },
  { item_key: "phase9_5_daily_automation", item_group: "Phase 9-5", item_label: "Daily Automation scheduler preparation completed", sort_order: 50 },
  { item_key: "phase9_6_logs_safety", item_group: "Phase 9-6", item_label: "Operation Logs and Safety Lock completed", sort_order: 60 },
  { item_key: "phase9_7_report_summary", item_group: "Phase 9-7", item_label: "Operation Report Summary screen completed", sort_order: 70 },
  { item_key: "admin_token_protection", item_group: "Security", item_label: "Admin APIs are protected by x-admin-token", sort_order: 80 },
  { item_key: "daily_worker_ready", item_group: "Operation", item_label: "Daily operation worker command is ready", sort_order: 90 },
  { item_key: "phase9_final_ready", item_group: "Final", item_label: "Phase 9 final completion decision is ready", sort_order: 100 }
];

async function ensurePhase9FinalChecklistTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_phase_final_checklists (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      phase_code VARCHAR(50) NOT NULL,
      item_key VARCHAR(100) NOT NULL,
      item_group VARCHAR(100) NOT NULL,
      item_label VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_done TINYINT(1) NOT NULL DEFAULT 0,
      note TEXT NULL,
      completed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_phase_final_item (phase_code, item_key),
      INDEX idx_phase_code (phase_code),
      INDEX idx_is_done (is_done)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function seedPhase9FinalChecklist() {
  await ensurePhase9FinalChecklistTable();

  for (const item of DEFAULT_PHASE9_FINAL_ITEMS) {
    await pool.query(`
      INSERT INTO ai_phase_final_checklists (
        phase_code,
        item_key,
        item_group,
        item_label,
        sort_order
      ) VALUES ('phase_9', ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        item_group = VALUES(item_group),
        item_label = VALUES(item_label),
        sort_order = VALUES(sort_order)
    `, [item.item_key, item.item_group, item.item_label, item.sort_order]);
  }
}

function calculateCompletionSummary(rows) {
  const total = rows.length;
  const done = rows.filter((row) => Number(row.is_done) === 1).length;
  const pending = Math.max(total - done, 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return { total, done, pending, percent };
}

async function getPhase9FinalChecklist() {
  await seedPhase9FinalChecklist();

  const [rows] = await pool.query(`
    SELECT
      id,
      phase_code,
      item_key,
      item_group,
      item_label,
      sort_order,
      is_done,
      note,
      completed_at,
      created_at,
      updated_at
    FROM ai_phase_final_checklists
    WHERE phase_code = 'phase_9'
    ORDER BY sort_order ASC, id ASC
  `);

  const summary = calculateCompletionSummary(rows);

  return {
    ok: true,
    phase_code: "phase_9",
    summary,
    final_status: summary.percent === 100 ? "READY" : "IN_PROGRESS",
    items: rows.map((row) => ({
      ...row,
      is_done: Number(row.is_done) === 1
    }))
  };
}

async function updatePhase9FinalChecklistItem({ item_key, is_done = false, note = null }) {
  if (!item_key) {
    throw new Error("item_key is required.");
  }

  await seedPhase9FinalChecklist();

  const doneValue = is_done ? 1 : 0;
  const completedAt = doneValue ? normalizeDateForMysql(new Date()) : null;

  const [result] = await pool.query(`
    UPDATE ai_phase_final_checklists
    SET
      is_done = ?,
      note = ?,
      completed_at = ?
    WHERE phase_code = 'phase_9'
      AND item_key = ?
  `, [doneValue, note || null, completedAt, item_key]);

  if (result.affectedRows === 0) {
    throw new Error(`Phase 9 checklist item not found: ${item_key}`);
  }

  return getPhase9FinalChecklist();
}

async function resetPhase9FinalChecklist() {
  await seedPhase9FinalChecklist();

  await pool.query(`
    UPDATE ai_phase_final_checklists
    SET
      is_done = 0,
      note = NULL,
      completed_at = NULL
    WHERE phase_code = 'phase_9'
  `);

  return getPhase9FinalChecklist();
}

async function getOperationReportSummary({ report_date = null } = {}) {
  await ensureDailyHealthCheckTable();
  await ensureDailyOperationChecklistTable();
  await ensureDailyAutomationTables();
  await ensureOperationSafetyTables();
  await seedPhase9FinalChecklist();

  const reportDate = normalizeCheckDate(report_date);

  const [healthRows] = await pool.query(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN overall_status = 'GOOD' THEN 1 ELSE 0 END) AS good_count,
      SUM(CASE WHEN overall_status = 'WARNING' THEN 1 ELSE 0 END) AS warning_count,
      SUM(CASE WHEN overall_status = 'ERROR' THEN 1 ELSE 0 END) AS error_count,
      MAX(checked_at) AS last_checked_at
    FROM ai_daily_health_checks
    WHERE DATE(checked_at) = ?
  `, [reportDate]);

  const [latestHealthRows] = await pool.query(`
    SELECT id, overall_status, checked_at, failed_queue_count, pending_queue_count, warnings_json, errors_json
    FROM ai_daily_health_checks
    WHERE DATE(checked_at) = ?
    ORDER BY checked_at DESC, id DESC
    LIMIT 1
  `, [reportDate]);

  const [automationRows] = await pool.query(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN overall_status = 'GOOD' THEN 1 ELSE 0 END) AS good_count,
      SUM(CASE WHEN overall_status = 'WARNING' THEN 1 ELSE 0 END) AS warning_count,
      SUM(CASE WHEN overall_status = 'ERROR' THEN 1 ELSE 0 END) AS error_count,
      SUM(CASE WHEN overall_status = 'RUNNING' THEN 1 ELSE 0 END) AS running_count,
      MAX(finished_at) AS last_finished_at
    FROM ai_daily_operation_automation_runs
    WHERE run_date = ?
  `, [reportDate]);

  const [checklistRows] = await pool.query(`
    SELECT item_key, item_group, item_label, is_done, note, completed_at
    FROM ai_daily_operation_checklists
    WHERE check_date = ?
    ORDER BY sort_order ASC, id ASC
  `, [reportDate]);

  const checklistSummary = calculateCompletionSummary(checklistRows);

  const [operationLogRows] = await pool.query(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN log_level = 'ERROR' THEN 1 ELSE 0 END) AS error_count,
      SUM(CASE WHEN log_level = 'WARNING' THEN 1 ELSE 0 END) AS warning_count,
      SUM(CASE WHEN log_level = 'INFO' THEN 1 ELSE 0 END) AS info_count,
      MAX(created_at) AS last_log_time
    FROM ai_operation_logs
    WHERE DATE(created_at) = ?
  `, [reportDate]);

  const queueStatusRows = await getSummaryQueueStatus();
  const safety = await getAutomationSafetyStatus();
  const finalChecklist = await getPhase9FinalChecklist();

  const health = healthRows[0] || {};
  const automation = automationRows[0] || {};
  const logs = operationLogRows[0] || {};
  const latestHealth = latestHealthRows[0] || null;

  const warnings = [];
  const errors = [];

  if (Number(health.total_count || 0) === 0) warnings.push("No Daily Health Check saved for the selected date.");
  if (Number(automation.total_count || 0) === 0) warnings.push("No Daily Automation run recorded for the selected date.");
  if (checklistSummary.total === 0) warnings.push("No Daily Operation Checklist rows exist for the selected date.");
  if (checklistSummary.total > 0 && checklistSummary.percent < 100) warnings.push(`Daily Operation Checklist is ${checklistSummary.percent}% complete.`);
  if (Number(logs.error_count || 0) > 0) errors.push(`Operation log errors found: ${Number(logs.error_count || 0)}`);
  if (Number(health.error_count || 0) > 0) errors.push(`Daily Health Check ERROR records found: ${Number(health.error_count || 0)}`);
  if (safety.safety_status === "WARNING") warnings.push("Automation safety status is WARNING.");
  if (safety.safety_status === "ERROR") errors.push("Automation safety status is ERROR.");

  const failedQueueCount = getQueueStatusCount(queueStatusRows, "failed");
  const pendingQueueCount = getQueueStatusCount(queueStatusRows, "pending");
  if (failedQueueCount > 0) errors.push(`Failed summary queue exists: ${failedQueueCount}`);
  if (pendingQueueCount >= 10) warnings.push(`Pending summary queue is high: ${pendingQueueCount}`);

  let overallStatus = "GOOD";
  if (errors.length > 0) overallStatus = "ERROR";
  else if (warnings.length > 0) overallStatus = "WARNING";

  return {
    ok: true,
    report_date: reportDate,
    generated_at: new Date().toISOString(),
    overall_status: overallStatus,
    daily_health: {
      total_count: Number(health.total_count || 0),
      good_count: Number(health.good_count || 0),
      warning_count: Number(health.warning_count || 0),
      error_count: Number(health.error_count || 0),
      last_checked_at: health.last_checked_at || null,
      latest: latestHealth ? {
        ...latestHealth,
        warnings: safeJsonArray(latestHealth.warnings_json),
        errors: safeJsonArray(latestHealth.errors_json)
      } : null
    },
    daily_automation: {
      total_count: Number(automation.total_count || 0),
      good_count: Number(automation.good_count || 0),
      warning_count: Number(automation.warning_count || 0),
      error_count: Number(automation.error_count || 0),
      running_count: Number(automation.running_count || 0),
      last_finished_at: automation.last_finished_at || null
    },
    daily_checklist: {
      summary: checklistSummary,
      items: checklistRows.map((row) => ({ ...row, is_done: Number(row.is_done) === 1 }))
    },
    operation_logs: {
      total_count: Number(logs.total_count || 0),
      info_count: Number(logs.info_count || 0),
      warning_count: Number(logs.warning_count || 0),
      error_count: Number(logs.error_count || 0),
      last_log_time: logs.last_log_time || null
    },
    summary_queue: {
      status_rows: queueStatusRows,
      failed_count: failedQueueCount,
      pending_count: pendingQueueCount
    },
    automation_safety: safety,
    phase9_final: finalChecklist,
    warnings,
    errors
  };
}


async function getPhase9FinalDecision({ report_date = null } = {}) {
  const report = await getOperationReportSummary({ report_date });
  const finalChecklist = report.phase9_final || await getPhase9FinalChecklist();

  const requiredActions = [];
  const acceptedWarnings = [];

  const checklistPercent = Number(finalChecklist?.summary?.percent || 0);
  const reportStatus = report.overall_status || "UNKNOWN";
  const hasErrors = Array.isArray(report.errors) && report.errors.length > 0;
  const hasWarnings = Array.isArray(report.warnings) && report.warnings.length > 0;

  if (checklistPercent < 100) {
    requiredActions.push(`Complete Phase 9 Final Checklist: ${checklistPercent}% completed.`);
  }

  if (hasErrors) {
    requiredActions.push("Resolve operation report errors before entering Phase 10.");
  }

  if (Number(report.summary_queue?.failed_count || 0) > 0) {
    requiredActions.push(`Retry or clear failed summary queue items: ${report.summary_queue.failed_count}.`);
  }

  if (report.automation_safety?.safety_status === "ERROR") {
    requiredActions.push("Resolve automation safety ERROR status.");
  }

  if (Number(report.daily_health?.total_count || 0) === 0) {
    requiredActions.push("Save at least one Daily Health Check record for the report date.");
  }

  if (Number(report.daily_automation?.total_count || 0) === 0) {
    requiredActions.push("Run Daily Automation at least once for the report date.");
  }

  if (hasWarnings) {
    acceptedWarnings.push(...report.warnings);
  }

  let decisionStatus = "NOT_READY";
  let phase10EntryAllowed = false;
  let decisionMessage = "Phase 9 is not ready. Complete required actions before Phase 10.";

  if (requiredActions.length === 0 && reportStatus === "GOOD" && finalChecklist.final_status === "READY") {
    decisionStatus = "READY_FOR_PHASE_10";
    phase10EntryAllowed = true;
    decisionMessage = "Phase 9 is complete. You can start Phase 10: actual AI response pipeline integration.";
  } else if (requiredActions.length === 0 && !hasErrors && finalChecklist.final_status === "READY") {
    decisionStatus = "READY_WITH_WARNINGS";
    phase10EntryAllowed = true;
    decisionMessage = "Phase 9 can enter Phase 10 with accepted warnings. Review warnings before production use.";
  }

  return {
    ok: true,
    phase_code: "phase_9",
    report_date: report.report_date,
    generated_at: new Date().toISOString(),
    decision_status: decisionStatus,
    phase10_entry_allowed: phase10EntryAllowed,
    decision_message: decisionMessage,
    required_actions: requiredActions,
    accepted_warnings: acceptedWarnings,
    phase10_start_scope: {
      phase: "Phase 10",
      title: "Actual AI Response Pipeline Integration",
      recommended_first_task: "Phase 10-1: Connect /ai/ask pipeline to Admin Context Preview and verified memory retrieval flow.",
      key_goal: "Use Project Assets + Recent Buffer + Summarized Memory as real context for GPT / Claude / Gemini responses."
    },
    verification_summary: {
      operation_report_status: reportStatus,
      final_checklist_status: finalChecklist.final_status,
      final_checklist_completion_percent: checklistPercent,
      health_checks_today: Number(report.daily_health?.total_count || 0),
      automation_runs_today: Number(report.daily_automation?.total_count || 0),
      daily_checklist_completion_percent: Number(report.daily_checklist?.summary?.percent || 0),
      failed_queue_count: Number(report.summary_queue?.failed_count || 0),
      pending_queue_count: Number(report.summary_queue?.pending_count || 0),
      automation_safety_status: report.automation_safety?.safety_status || "UNKNOWN"
    },
    report
  };
}

async function getSystemStatus() {
  const [
    projectsCount,
    memoryCount,
    recentBufferCount,
    conversationLogsCount,
    summaryQueueCount,
    projectAssetsCount,
    modelProfilesCount,
    routerRulesCount,
    promptTemplatesCount,
    contextSessionsCount,
    embeddingsCount,
    tasksCount,
    memoryLinksCount,
    summaryQueueStatus,
    memoryCountByProject,
    assetCountByProject,
    latestMemory,
    latestConversation
  ] = await Promise.all([
    getCount("ai_projects"),
    getCount("ai_memory"),
    getCount("ai_recent_buffer"),
    getCount("ai_conversation_logs"),
    getCount("ai_summary_queue"),
    getCount("project_assets"),
    getCount("ai_model_profiles"),
    getCount("ai_router_rules"),
    getCount("ai_prompt_templates"),
    getCount("ai_context_sessions"),
    getCount("ai_embeddings"),
    getCount("ai_tasks"),
    getCount("ai_memory_links"),
    getSummaryQueueStatus(),
    getMemoryCountByProject(),
    getAssetCountByProject(),
    getLatestMemory(5),
    getLatestConversation(5)
  ]);

  return {
    ok: true,
    service: "ai-memory-gateway",
    phase: "Phase 4-10",
    status: "running",
    database_summary: {
      ai_projects: projectsCount,
      ai_memory: memoryCount,
      ai_recent_buffer: recentBufferCount,
      ai_conversation_logs: conversationLogsCount,
      ai_summary_queue: summaryQueueCount,
      project_assets: projectAssetsCount,
      ai_model_profiles: modelProfilesCount,
      ai_router_rules: routerRulesCount,
      ai_prompt_templates: promptTemplatesCount,
      ai_context_sessions: contextSessionsCount,
      ai_embeddings: embeddingsCount,
      ai_tasks: tasksCount,
      ai_memory_links: memoryLinksCount
    },
    queue_summary: summaryQueueStatus,
    memory_by_project: memoryCountByProject,
    assets_by_project: assetCountByProject,
    latest_memory: latestMemory,
    latest_conversation: latestConversation,
    checked_at: new Date().toISOString()
  };
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
  status = "active"
}) {
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

module.exports = {
  getSystemStatus,
  getDailyHealthCheck,
  saveDailyHealthCheck,
  getDailyHealthCheckHistory,
  ensureDailyHealthCheckTable,
  getDailyOperationChecklist,
  updateDailyOperationChecklistItem,
  resetDailyOperationChecklist,
  ensureDailyOperationChecklistTable,
  ensureDailyAutomationTables,
  getDailyAutomationConfig,
  updateDailyAutomationConfig,
  runDailyOperationAutomation,
  getDailyAutomationHistory,
  shouldRunDailyAutomationNow,
  ensureOperationSafetyTables,
  createOperationLog,
  getOperationLogs,
  cleanupOperationLogs,
  acquireSystemOperationLock,
  releaseSystemOperationLock,
  getAutomationSafetyStatus,
  getOperationReportSummary,
  getPhase9FinalChecklist,
  updatePhase9FinalChecklistItem,
  resetPhase9FinalChecklist,
  ensurePhase9FinalChecklistTable,
  getPhase9FinalDecision
};