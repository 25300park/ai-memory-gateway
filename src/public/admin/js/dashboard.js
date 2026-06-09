let latestQueueRows = [];
let latestAssetRows = [];
let latestConversationRows = [];
let latestDailyHealthCheck = null;

function setText(id, value, className = null) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;

  // className을 명시적으로 넘긴 경우에만 class를 교체합니다.
  // Daily Health Check의 <pre class="mini-output"> 같은 기존 레이아웃 class가
  // setText 호출로 제거되어 JSON이 박스 밖으로 넘치는 문제를 방지합니다.
  if (className !== null) {
    el.className = className;
  }
}

function setRawOutput(data) {
  const el = document.getElementById("rawOutput");
  if (!el) return;
  el.textContent = JSON.stringify(data, null, 2);
}

function nowText() {
  return new Date().toLocaleString();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusBadge(status) {
  const value = status || "";
  const lower = String(value).toLowerCase();

  let className = "badge";
  if (lower === "completed" || lower === "active" || lower === "good") className += " badge-ok";
  else if (lower === "pending" || lower === "processing" || lower === "warning") className += " badge-warning";
  else if (lower === "failed" || lower === "error") className += " badge-error";
  else className += " badge-muted";

  return `<span class="${className}">${value}</span>`;
}

function getQueueStatusFilter() {
  const el = document.getElementById("queueStatusFilter");
  return el?.value?.trim() || "all";
}

function getRetryFailedLimit() {
  const el = document.getElementById("retryFailedLimit");
  const value = Number(el?.value || 10);
  if (!Number.isInteger(value) || value < 1) return 10;
  return Math.min(value, 100);
}

function getSelectedQueueIds() {
  return Array.from(document.querySelectorAll(".queue-select-checkbox:checked"))
    .map((checkbox) => Number(checkbox.value))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function syncSelectAllQueueCheckbox() {
  const selectAll = document.getElementById("selectAllQueueCheckbox");
  if (!selectAll) return;

  const boxes = Array.from(document.querySelectorAll(".queue-select-checkbox"));
  const checked = boxes.filter((box) => box.checked);

  selectAll.checked = boxes.length > 0 && checked.length === boxes.length;
  selectAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
}

function toggleAllFailedQueueRows(checked) {
  document.querySelectorAll(".queue-select-checkbox").forEach((box) => {
    box.checked = checked;
  });
  syncSelectAllQueueCheckbox();
}

function setQueueResultInfo(message) {
  const el = document.getElementById("queueResultInfo");
  if (!el) return;
  el.textContent = message;
}

function filterQueueRowsByStatus(rows) {
  const statusFilter = getQueueStatusFilter();

  if (statusFilter === "all") {
    return rows;
  }

  return rows.filter(row => {
    const status = String(row.status ?? row.queue_status ?? "").toLowerCase();
    return status === statusFilter.toLowerCase();
  });
}

function extractRows(response, candidates = []) {
  if (Array.isArray(response)) return response;

  if (Array.isArray(response?.results)) return response.results;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.rows)) return response.rows;
  if (Array.isArray(response?.items)) return response.items;

  if (Array.isArray(response?.data?.results)) return response.data.results;
  if (Array.isArray(response?.data?.rows)) return response.data.rows;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  if (Array.isArray(response?.data?.queue)) return response.data.queue;
  if (Array.isArray(response?.data?.memories)) return response.data.memories;

  for (const key of candidates) {
    if (Array.isArray(response?.[key])) return response[key];
    if (Array.isArray(response?.data?.[key])) return response.data[key];
  }

  return [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMemoryResultInfo(message) {
  const el = document.getElementById("memoryResultInfo");
  if (!el) return;
  el.textContent = message;
}

function getMemoryProjectCode() {
  const el = document.getElementById("memoryProjectCode");
  return el?.value?.trim() || "rbs_ai_memory";
}

function getMemoryKeyword() {
  const el = document.getElementById("memoryKeyword");
  return el?.value?.trim() || "";
}

function getMemoryStatusFilter() {
  const el = document.getElementById("memoryStatusFilter");
  return el?.value?.trim() || "active";
}

function setRetryResult(data) {
  const output = document.getElementById("retryResultOutput");
  if (!output) return;

  output.textContent = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);
}

function updateQueueSummaryCards(rows) {
  const counts = {
    all: rows.length,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  };

  rows.forEach(row => {
    const status = String(row.status ?? row.queue_status ?? "").toLowerCase();

    if (status === "pending") counts.pending += 1;
    else if (status === "processing") counts.processing += 1;
    else if (status === "completed") counts.completed += 1;
    else if (status === "failed") counts.failed += 1;
  });

  setText("queueCountAll", counts.all);
  setText("queueCountPending", counts.pending);
  setText("queueCountProcessing", counts.processing);
  setText("queueCountCompleted", counts.completed);
  setText("queueCountFailed", counts.failed);
}

function getAssetProjectCode() {
  const el = document.getElementById("assetProjectCode");
  return el?.value?.trim() || "rbs_ai_memory";
}

function getAssetTypeFilter() {
  const el = document.getElementById("assetTypeFilter");
  return el?.value?.trim() || "all";
}

function setAssetResultInfo(message) {
  const el = document.getElementById("assetResultInfo");
  if (!el) return;
  el.textContent = message;
}

function filterAssetRowsByType(rows) {
  const typeFilter = getAssetTypeFilter();

  if (typeFilter === "all") {
    return rows;
  }

  return rows.filter(row => {
    const type = String(row.asset_type ?? row.type ?? "").toLowerCase();
    return type === typeFilter.toLowerCase();
  });
}

function getConversationSessionId() {
  const el = document.getElementById("conversationSessionId");
  return el?.value?.trim() || "";
}

function setConversationResultInfo(message) {
  const el = document.getElementById("conversationResultInfo");
  if (!el) return;
  el.textContent = message;
}

function calculateQueueCounts(rows) {
  const counts = {
    total: rows.length,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  };

  rows.forEach(row => {
    const status = String(row.status ?? row.queue_status ?? "").toLowerCase();

    if (status === "pending") counts.pending += 1;
    else if (status === "processing") counts.processing += 1;
    else if (status === "completed") counts.completed += 1;
    else if (status === "failed") counts.failed += 1;
  });

  return counts;
}

function updateDashboardQueueCards(rows) {
  const counts = calculateQueueCounts(rows);

  setText("dashboardQueueTotal", counts.total);
  setText("dashboardQueuePending", counts.pending);
  setText("dashboardQueueCompleted", counts.completed);
  setText("dashboardQueueFailed", counts.failed);
}

function updateDashboardMemoryCount(rows) {
  setText("dashboardMemoryCount", rows.length);
}

function updateDashboardAssetCount(rows) {
  setText("dashboardAssetCount", rows.length);
}

async function loadDashboard() {
  const result = {
    health: null,
    dbHealth: null,
    systemStatus: null
  };

  try {
    result.health = await AdminAPI.get("/health");
    setText("apiStatus", "OK", "status-ok");
  } catch (error) {
    result.health = { error: error.message };
    setText("apiStatus", "ERROR", "status-error");
  }

  try {
    result.dbHealth = await AdminAPI.get("/health/db");
    setText("dbStatus", "OK", "status-ok");
  } catch (error) {
    result.dbHealth = { error: error.message };
    setText("dbStatus", "ERROR", "status-error");
  }

  try {
    result.systemStatus = await AdminAPI.get("/ai/system/status");
    setText("systemStatus", "OK", "status-ok");
  } catch (error) {
    result.systemStatus = { error: error.message };
    setText("systemStatus", "ERROR", "status-error");
  }

  setText("lastChecked", nowText());
  setRawOutput(result);

  await loadDashboardCounts();
}

async function loadDashboardCounts() {
  const projectCode = "rbs_ai_memory";

  try {
    const queueData = await AdminAPI.get("/ai/summary/queue");
    const queueRows = extractRows(queueData, ["queue", "summary_queue", "summaryQueue", "results"]);

    updateDashboardQueueCards(queueRows);
  } catch (error) {
    updateDashboardQueueCards([]);
  }

  try {
    const memoryData = await AdminAPI.get(`/ai/memory/recent?project_code=${encodeURIComponent(projectCode)}`);
    const memoryRows = extractRows(memoryData, ["memories", "memory", "recent_memory", "recentMemory", "results"]);

    updateDashboardMemoryCount(memoryRows);
  } catch (error) {
    updateDashboardMemoryCount([]);
  }

  try {
    const assetData = await AdminAPI.get(`/ai/project/${encodeURIComponent(projectCode)}/assets`);
    const assetRows = extractRows(assetData, ["assets", "project_assets", "projectAssets", "results"]);

    updateDashboardAssetCount(assetRows);
  } catch (error) {
    updateDashboardAssetCount([]);
  }
}


function setDailyStatusBadge(id, status) {
  const el = document.getElementById(id);
  if (!el) return;

  const value = status || "UNKNOWN";
  const lower = String(value).toLowerCase();

  el.textContent = value;
  el.className = "health-status";

  if (lower === "good") {
    el.classList.add("health-status-good");
  } else if (lower === "warning") {
    el.classList.add("health-status-warning");
  } else if (lower === "error") {
    el.classList.add("health-status-error");
  } else {
    el.classList.add("health-status-muted");
  }
}

function formatHealthList(items, emptyText) {
  if (!Array.isArray(items) || items.length === 0) {
    return emptyText;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function renderDailyHealthCheck(data) {
  setDailyStatusBadge("dailyOverallStatus", data?.overall_status);

  setText("dailyCheckedAt", formatDate(data?.checked_at) || "-");
  setText("dailyApiServer", data?.api_server?.status || "-");
  setText("dailyApiServerMessage", data?.api_server?.message || "-");
  setText("dailyDbConnection", data?.db_connection?.status || "-");
  setText("dailyDbConnectionMessage", data?.db_connection?.message || "-");
  setText("dailyFailedQueueCount", data?.summary_queue?.failed_count ?? "-");
  setText("dailyPendingQueueCount", data?.summary_queue?.pending_count ?? "-");
  setText("dailyRecentMemoryCount", data?.memory?.recent_memory_count ?? "-");
  setText("dailyTotalMemoryCount", data?.memory?.total_memory_count ?? "-");
  setText("dailyProjectAssetsCount", data?.project_assets?.count ?? "-");
  setText("dailyConversationLogsCount", data?.conversation_logs?.total_count ?? "-");
  setText("dailyLastConversationTime", formatDate(data?.conversation_logs?.last_conversation_time) || "-");
  setText("dailyLastMemoryTime", formatDate(data?.memory?.last_memory_time) || "-");
  setText("dailyWarnings", formatHealthList(data?.warnings, "No warnings"));
  setText("dailyErrors", formatHealthList(data?.errors, "No errors"));
  setText("dailySaveReady", JSON.stringify(data?.save_ready || {}, null, 2));
}

async function loadDailyHealthCheck() {
  setDailyStatusBadge("dailyOverallStatus", "UNKNOWN");
  setText("dailyCheckedAt", "Checking...");

  try {
    const data = await AdminAPI.get("/ai/system/daily-health-check");
    latestDailyHealthCheck = data;
    renderDailyHealthCheck(data);
    setRawOutput(data);
  } catch (error) {
    const fallback = {
      ok: false,
      checked_at: new Date().toISOString(),
      overall_status: "ERROR",
      api_server: {
        status: "ERROR",
        message: "Daily Health Check request failed"
      },
      db_connection: {
        status: "UNKNOWN",
        message: "Could not verify DB connection"
      },
      summary_queue: {
        failed_count: "-",
        pending_count: "-"
      },
      memory: {
        recent_memory_count: "-",
        total_memory_count: "-",
        last_memory_time: null
      },
      project_assets: {
        count: "-"
      },
      conversation_logs: {
        total_count: "-",
        last_conversation_time: null
      },
      warnings: [],
      errors: [error.message]
    };

    latestDailyHealthCheck = fallback;
    renderDailyHealthCheck(fallback);
    setRawOutput(fallback);
  }
}


function setDailyHealthSaveResult(message, className = null) {
  setText("dailyHealthSaveResult", message, className);
}

function renderDailyHealthHistory(rows) {
  const tbody = document.getElementById("dailyHealthHistoryTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9">No saved daily health check history found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.slice(0, 50).map((row) => {
    const warnings = Array.isArray(row.warnings)
      ? row.warnings
      : [];
    const errors = Array.isArray(row.errors)
      ? row.errors
      : [];

    return `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(formatDate(row.checked_at))}</td>
        <td>${statusBadge(row.overall_status)}</td>
        <td>${escapeHtml(row.failed_queue_count ?? 0)}</td>
        <td>${escapeHtml(row.pending_queue_count ?? 0)}</td>
        <td>${escapeHtml(row.recent_memory_count ?? 0)}</td>
        <td>${escapeHtml(row.project_assets_count ?? 0)}</td>
        <td class="error-cell">${escapeHtml(warnings.length ? warnings.join("\n") : "-")}</td>
        <td class="error-cell">${escapeHtml(errors.length ? errors.join("\n") : "-")}</td>
      </tr>
    `;
  }).join("");
}

async function loadDailyHealthHistory() {
  const tbody = document.getElementById("dailyHealthHistoryTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="9">Loading daily health check history...</td></tr>`;
  }

  try {
    const data = await AdminAPI.get("/ai/system/daily-health-check/history?limit=10");
    const rows = extractRows(data, ["results"]);
    renderDailyHealthHistory(rows);
    setDailyHealthSaveResult(`History loaded: ${rows.length} saved check(s).`);
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9">Error: ${escapeHtml(error.message)}</td></tr>`;
    }
    setDailyHealthSaveResult(`History load failed: ${error.message}`, "status-error");
  }
}

async function saveDailyHealthCheckToDb() {
  setDailyHealthSaveResult("Saving Daily Health Check to DB...");

  try {
    const data = await AdminAPI.post("/ai/system/daily-health-check/save");

    if (data.health_check) {
      latestDailyHealthCheck = data.health_check;
      renderDailyHealthCheck(data.health_check);
    }

    setRawOutput(data);
    setDailyHealthSaveResult(
      `Saved successfully. ID: ${data.id || "-"}, saved at: ${formatDate(data.saved_at)}`,
      "status-ok"
    );

    await loadDailyHealthHistory();
  } catch (error) {
    setDailyHealthSaveResult(`Save failed: ${error.message}`, "status-error");
    setRawOutput({ ok: false, error: error.message });
  }
}

async function loadQueue() {
  const tbody = document.getElementById("queueTableBody");
  if (!tbody) return;

  const statusFilter = getQueueStatusFilter();

  tbody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
  setQueueResultInfo(`Loading summary queue. status=${statusFilter}`);

  try {
    let url = "/ai/summary/queue";

    if (statusFilter !== "all") {
      url += `?status=${encodeURIComponent(statusFilter)}`;
    }

    const data = await AdminAPI.get(url);
    const rows = extractRows(data, ["queue", "summary_queue", "summaryQueue", "results"]);

    updateQueueSummaryCards(rows);
    updateDashboardQueueCards(rows);

    const filteredRows = filterQueueRowsByStatus(rows);
    latestQueueRows = filteredRows;

    if (!filteredRows.length) {
      const message = statusFilter === "failed"
        ? "No failed queue found. This is normal."
        : `No queue data found. status=${statusFilter}`;

      tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(message)}</td></tr>`;
      setQueueResultInfo(message);
      latestQueueRows = [];
      return;
    }

    tbody.innerHTML = filteredRows.slice(0, 50).map(row => {
      const conversationId = row.conversation_log_id ?? row.conversation_id ?? "";
      const status = String(row.status ?? row.queue_status ?? "").toLowerCase();
      const isFailed = status === "failed";
      const checkbox = isFailed
        ? `<input class="queue-select-checkbox" type="checkbox" value="${row.id}" onchange="syncSelectAllQueueCheckbox()" />`
        : "";
      const retryButton = isFailed
        ? `<button class="small-btn danger-small-btn" onclick="retryOneQueue(${row.id})">Retry</button>`
        : "";

      return `
        <tr>
          <td>${checkbox}</td>
          <td>${row.id ?? ""}</td>
          <td>${conversationId}</td>
          <td>${statusBadge(status)}</td>
          <td class="error-cell">${escapeHtml(row.error_message ?? row.error ?? "")}</td>
          <td>${formatDate(row.created_at ?? row.createdAt ?? "")}</td>
          <td class="action-cell">
            <button class="small-btn" onclick="showQueueDetail(${row.id})">Queue</button>
            <button class="small-btn" onclick="loadConversationDetail(${conversationId || "null"})">Conversation</button>
            ${retryButton}
          </td>
        </tr>
      `;
    }).join("");

    syncSelectAllQueueCheckbox();

    setQueueResultInfo(`${filteredRows.length} queue item(s) loaded. status=${statusFilter}`);
  } catch (error) {
    updateQueueSummaryCards([]);
    tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(error.message)}</td></tr>`;
    setQueueResultInfo(`Error: ${error.message}`);
  }
}

function showQueueDetail(queueId) {
  const output = document.getElementById("queueDetailOutput");
  if (!output) return;

  const row = latestQueueRows.find(item => String(item.id) === String(queueId));

  if (!row) {
    output.textContent = `Queue item #${queueId} not found in loaded rows.`;
    return;
  }

  output.textContent = JSON.stringify(row, null, 2);
}

async function loadConversationDetail(conversationLogId) {
  const output = document.getElementById("conversationDetailOutput");
  if (!output) return;

  if (!conversationLogId) {
    output.textContent = "conversation_log_id is missing.";
    return;
  }

  output.textContent = `Loading conversation #${conversationLogId}...`;

  try {
    const data = await AdminAPI.get(`/ai/conversation/${conversationLogId}`);
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
  }
}

async function retryFailedQueue() {
  const limit = getRetryFailedLimit();
  const confirmed = confirm(`Retry up to ${limit} failed summary queue item(s)?`);
  if (!confirmed) return;

  setRetryResult("Retry request is running...");
  setQueueResultInfo("Retry failed queue request is running...");

  try {
    const result = await AdminAPI.post("/ai/summary/retry-failed", { limit });

    setRetryResult(result);
    setRawOutput(result);

    const retriedCount = result?.result?.retried_count ?? 0;
    setQueueResultInfo(`Retry request completed. Retried: ${retriedCount}. Reloading queue...`);

    await loadQueue();
  } catch (error) {
    setRetryResult(`Error: ${error.message}`);
    setQueueResultInfo(`Retry failed: ${error.message}`);
    alert(`Retry failed: ${error.message}`);
  }
}

async function retryOneQueue(queueId) {
  const confirmed = confirm(`Retry failed queue #${queueId}?`);
  if (!confirmed) return;

  setRetryResult(`Retrying queue #${queueId}...`);

  try {
    const result = await AdminAPI.post("/ai/summary/retry-one", { id: queueId });

    setRetryResult(result);
    setRawOutput(result);
    setQueueResultInfo(`Queue #${queueId} retry completed. Reloading queue...`);

    await loadQueue();
  } catch (error) {
    setRetryResult(`Error: ${error.message}`);
    setQueueResultInfo(`Retry one failed: ${error.message}`);
    alert(`Retry one failed: ${error.message}`);
  }
}

async function retrySelectedQueue() {
  const ids = getSelectedQueueIds();

  if (!ids.length) {
    alert("Select at least one failed queue item first.");
    return;
  }

  const confirmed = confirm(`Retry selected failed queue item(s)? count=${ids.length}`);
  if (!confirmed) return;

  setRetryResult(`Retrying selected queue ids: ${ids.join(", ")}`);

  try {
    const result = await AdminAPI.post("/ai/summary/retry-selected", { ids });

    setRetryResult(result);
    setRawOutput(result);

    const retriedCount = result?.result?.retried_count ?? 0;
    setQueueResultInfo(`Selected retry completed. Retried: ${retriedCount}. Reloading queue...`);

    await loadQueue();
  } catch (error) {
    setRetryResult(`Error: ${error.message}`);
    setQueueResultInfo(`Retry selected failed: ${error.message}`);
    alert(`Retry selected failed: ${error.message}`);
  }
}

async function resetStuckProcessingQueue() {
  const confirmed = confirm("Move processing queue items older than 30 minutes back to pending?");
  if (!confirmed) return;

  setRetryResult("Reset stuck processing request is running...");

  try {
    const result = await AdminAPI.post("/ai/summary/reset-stuck-processing", {
      older_than_minutes: 30,
      limit: 20
    });

    setRetryResult(result);
    setRawOutput(result);

    const resetCount = result?.result?.reset_count ?? 0;
    setQueueResultInfo(`Stuck processing reset completed. Reset: ${resetCount}. Reloading queue...`);

    await loadQueue();
  } catch (error) {
    setRetryResult(`Error: ${error.message}`);
    setQueueResultInfo(`Reset stuck processing failed: ${error.message}`);
    alert(`Reset stuck processing failed: ${error.message}`);
  }
}

function renderMemoryRows(rows) {
  const tbody = document.getElementById("memoryTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6">No memory data found.</td></tr>`;
    setMemoryResultInfo("No memory data found.");
    return;
  }

  tbody.innerHTML = rows.slice(0, 50).map(row => {
    const preview = row.summary || row.content || row.title || row.message || "";
    return `
      <tr>
        <td>${row.id ?? ""}</td>
        <td>${escapeHtml(row.project_code ?? row.projectCode ?? "")}</td>
        <td>${escapeHtml(row.memory_type ?? row.type ?? "")}</td>
        <td>${statusBadge(row.status ?? "")}</td>
        <td class="preview-cell">${escapeHtml(String(preview).slice(0, 180))}</td>
        <td class="action-cell">
          <button class="small-btn" onclick="loadMemoryDetail(${row.id})">View</button>
          <button class="small-btn" onclick="updateMemoryStatus(${row.id}, 'active')">Activate</button>
          <button class="small-btn warning-btn" onclick="updateMemoryStatus(${row.id}, 'archived')">Archive</button>
          <button class="small-btn danger-small-btn" onclick="updateMemoryStatus(${row.id}, 'deleted')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");

  setMemoryResultInfo(`${rows.length} memory item(s) loaded.`);
}

function filterRowsByStatus(rows) {
  const statusFilter = getMemoryStatusFilter();

  if (statusFilter === "all") {
    return rows;
  }

  return rows.filter(row => {
    const status = String(row.status ?? "").toLowerCase();
    return status === statusFilter.toLowerCase();
  });
}

async function loadRecentMemory() {
  const tbody = document.getElementById("memoryTableBody");
  if (!tbody) return;

  const projectCode = getMemoryProjectCode();
  const statusFilter = getMemoryStatusFilter();

  tbody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
  setMemoryResultInfo("Loading recent memory...");

  try {
    let url = `/ai/memory/recent?project_code=${encodeURIComponent(projectCode)}`;

    if (statusFilter !== "all") {
      url += `&status=${encodeURIComponent(statusFilter)}`;
    }

    const data = await AdminAPI.get(url);
    const rows = extractRows(data, ["memories", "memory", "recent_memory", "recentMemory", "results"]);
    updateDashboardMemoryCount(rows);
    
    const filteredRows = filterRowsByStatus(rows);
    renderMemoryRows(filteredRows);
    
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(error.message)}</td></tr>`;
    setMemoryResultInfo(`Error: ${error.message}`);
  }
}

async function searchMemory() {
  const tbody = document.getElementById("memoryTableBody");
  if (!tbody) return;

  const projectCode = getMemoryProjectCode();
  const keyword = getMemoryKeyword();
  const statusFilter = getMemoryStatusFilter();

  if (!keyword) {
    alert("Please enter a memory search keyword.");
    return;
  }

  tbody.innerHTML = `<tr><td colspan="6">Searching...</td></tr>`;
  setMemoryResultInfo(`Searching memory for "${keyword}"...`);

  try {
    let url = `/ai/memory/search?project_code=${encodeURIComponent(projectCode)}&q=${encodeURIComponent(keyword)}`;

    if (statusFilter !== "all") {
      url += `&status=${encodeURIComponent(statusFilter)}`;
    }

    const data = await AdminAPI.get(url);
    const rows = extractRows(data, ["memories", "memory", "results"]);
    const filteredRows = filterRowsByStatus(rows);
    renderMemoryRows(filteredRows);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(error.message)}</td></tr>`;
    setMemoryResultInfo(`Error: ${error.message}`);
  }
}

async function loadMemoryDetail(memoryId) {
  const output = document.getElementById("memoryDetailOutput");
  if (!output) return;

  output.textContent = `Loading memory #${memoryId}...`;

  try {
    const data = await AdminAPI.get(`/ai/memory/${memoryId}`);
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
  }
}

async function updateMemoryStatus(memoryId, status) {
  const confirmed = confirm(`Change memory #${memoryId} status to "${status}"?`);
  if (!confirmed) return;

  try {
    const result = await AdminAPI.patch(`/ai/memory/${memoryId}/status`, {
      status
    });

    const output = document.getElementById("memoryDetailOutput");
    if (output) {
      output.textContent = JSON.stringify(result, null, 2);
    }

    alert(`Memory #${memoryId} status update request completed.`);

    await loadRecentMemory();
  } catch (error) {
    alert(`Failed to update memory status: ${error.message}`);
  }
}

function getManualMemoryFormValues() {
  const projectCode = document.getElementById("manualMemoryProjectCode")?.value?.trim() || "rbs_ai_memory";
  const title = document.getElementById("manualMemoryTitle")?.value?.trim() || "";
  const summary = document.getElementById("manualMemorySummary")?.value?.trim() || "";

  return {
    project_code: projectCode,
    title,
    summary
  };
}

function setManualMemoryResult(data) {
  const output = document.getElementById("manualMemoryResultOutput");
  if (!output) return;
  output.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function clearManualMemoryForm() {
  const titleEl = document.getElementById("manualMemoryTitle");
  const summaryEl = document.getElementById("manualMemorySummary");

  if (titleEl) titleEl.value = "";
  if (summaryEl) summaryEl.value = "";

  setManualMemoryResult("Manual memory form cleared.");
}

async function saveManualMemory() {
  const payload = getManualMemoryFormValues();

  if (!payload.project_code) {
    alert("project_code is required.");
    return;
  }

  if (!payload.title) {
    alert("title is required.");
    return;
  }

  if (!payload.summary) {
    alert("summary is required.");
    return;
  }

  setManualMemoryResult("Saving manual memory...");

  try {
    const result = await AdminAPI.post("/ai/memory/save", payload);
    setManualMemoryResult(result);

    alert("Manual memory save request completed.");

    await loadRecentMemory();
  } catch (error) {
    setManualMemoryResult(`Error: ${error.message}`);
    alert(`Failed to save manual memory: ${error.message}`);
  }
}

function renderAssetRows(rows) {
  const tbody = document.getElementById("assetTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7">No asset data found.</td></tr>`;
    setAssetResultInfo("No asset data found.");
    return;
  }

  tbody.innerHTML = rows.slice(0, 100).map(row => {
    const assetId = row.id ?? "";
    const title = row.title || row.asset_title || "";
    const updated = row.updated_at || row.updatedAt || row.created_at || "";

    return `
      <tr>
        <td>${assetId}</td>
        <td>${escapeHtml(row.project_code ?? row.projectCode ?? "")}</td>
        <td>${escapeHtml(row.asset_type ?? row.type ?? "")}</td>
        <td class="preview-cell">${escapeHtml(title)}</td>
        <td>${statusBadge(row.status ?? "")}</td>
        <td>${formatDate(updated)}</td>
        <td class="action-cell">
          <button class="small-btn" onclick="showAssetDetail(${assetId})">View</button>
          <button class="small-btn" onclick="fillEditAssetForm(${assetId})">Edit</button>
        </td>
      </tr>
    `;
  }).join("");

  setAssetResultInfo(`${rows.length} asset item(s) loaded.`);
}

function showAssetDetail(assetId) {
  const output = document.getElementById("assetDetailOutput");
  if (!output) return;

  const row = latestAssetRows.find(item => String(item.id) === String(assetId));

  if (!row) {
    output.textContent = `Asset item #${assetId} not found in loaded rows.`;
    return;
  }

  output.textContent = JSON.stringify(row, null, 2);
}

function fillEditAssetForm(assetId) {
  const row = latestAssetRows.find(item => String(item.id) === String(assetId));

  if (!row) {
    alert(`Asset item #${assetId} not found in loaded rows.`);
    return;
  }

  const idEl = document.getElementById("editAssetId");
  const typeEl = document.getElementById("editAssetType");
  const titleEl = document.getElementById("editAssetTitle");
  const contentEl = document.getElementById("editAssetContent");
  const priorityEl = document.getElementById("editAssetPriority");
  const statusEl = document.getElementById("editAssetStatus");

  if (idEl) idEl.value = row.id ?? "";
  if (typeEl) typeEl.value = row.asset_type ?? row.type ?? "rule";
  if (titleEl) titleEl.value = row.title ?? row.asset_title ?? "";
  if (contentEl) contentEl.value = row.content ?? "";
  if (priorityEl) priorityEl.value = row.priority ?? 100;

  const currentStatus = row.status || (row.is_active ? "active" : "inactive");
  if (statusEl) statusEl.value = currentStatus;

  const output = document.getElementById("editAssetResultOutput");
  if (output) {
    output.textContent = `Loaded asset #${assetId} into edit form.`;
  }
}

function getEditAssetFormValues() {
  const id = document.getElementById("editAssetId")?.value?.trim() || "";
  const assetType = document.getElementById("editAssetType")?.value?.trim() || "rule";
  const title = document.getElementById("editAssetTitle")?.value?.trim() || "";
  const content = document.getElementById("editAssetContent")?.value?.trim() || "";
  const priorityRaw = document.getElementById("editAssetPriority")?.value?.trim() || "100";
  const status = document.getElementById("editAssetStatus")?.value?.trim() || "active";
  const priority = Number(priorityRaw);

  return {
    id,
    asset_type: assetType,
    title,
    content,
    priority: Number.isNaN(priority) ? 100 : priority,
    status
  };
}

function setEditAssetResult(data) {
  const output = document.getElementById("editAssetResultOutput");
  if (!output) return;

  output.textContent = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);
}

function clearEditAssetForm() {
  const idEl = document.getElementById("editAssetId");
  const titleEl = document.getElementById("editAssetTitle");
  const contentEl = document.getElementById("editAssetContent");
  const priorityEl = document.getElementById("editAssetPriority");
  const statusEl = document.getElementById("editAssetStatus");

  if (idEl) idEl.value = "";
  if (titleEl) titleEl.value = "";
  if (contentEl) contentEl.value = "";
  if (priorityEl) priorityEl.value = "100";
  if (statusEl) statusEl.value = "active";

  setEditAssetResult("Edit asset form cleared.");
}

async function updateProjectAsset() {
  const payload = getEditAssetFormValues();

  if (!payload.id) {
    alert("Please select an asset first.");
    return;
  }

  if (!payload.asset_type) {
    alert("asset_type is required.");
    return;
  }

  if (!payload.title) {
    alert("title is required.");
    return;
  }

  if (!payload.content) {
    alert("content is required.");
    return;
  }

  const confirmed = confirm(`Update asset #${payload.id}?`);
  if (!confirmed) return;

  setEditAssetResult("Updating project asset...");

  try {
    const result = await AdminAPI.patch(`/ai/project/assets/${payload.id}`, {
      asset_type: payload.asset_type,
      title: payload.title,
      content: payload.content,
      priority: payload.priority,
      status: payload.status
    });

    setEditAssetResult(result);

    alert("Project asset update request completed.");

    await loadAssets();
  } catch (error) {
    setEditAssetResult(`Error: ${error.message}`);
    alert(`Failed to update project asset: ${error.message}`);
  }
}

async function loadAssets() {
  const tbody = document.getElementById("assetTableBody");
  if (!tbody) return;

  const projectCode = getAssetProjectCode();
  const typeFilter = getAssetTypeFilter();

  tbody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
  setAssetResultInfo(`Loading project assets. project=${projectCode}, type=${typeFilter}`);

  try {
    const data = await AdminAPI.get(`/ai/project/${encodeURIComponent(projectCode)}/assets`);
    const rows = extractRows(data, ["assets", "project_assets", "projectAssets", "results"]);
    updateDashboardAssetCount(rows);

    const filteredRows = filterAssetRowsByType(rows);

    latestAssetRows = filteredRows;

    renderAssetRows(filteredRows);
  } catch (error) {
    latestAssetRows = [];
    tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(error.message)}</td></tr>`;
    setAssetResultInfo(`Error: ${error.message}`);
  }
}

function getCreateAssetFormValues() {
  const projectCode = document.getElementById("createAssetProjectCode")?.value?.trim() || "rbs_ai_memory";
  const assetType = document.getElementById("createAssetType")?.value?.trim() || "rule";
  const title = document.getElementById("createAssetTitle")?.value?.trim() || "";
  const content = document.getElementById("createAssetContent")?.value?.trim() || "";
  const priorityRaw = document.getElementById("createAssetPriority")?.value?.trim() || "100";
  const priority = Number(priorityRaw);

  return {
    project_code: projectCode,
    asset_type: assetType,
    title,
    content,
    priority: Number.isNaN(priority) ? 100 : priority
  };
}

function setCreateAssetResult(data) {
  const output = document.getElementById("createAssetResultOutput");
  if (!output) return;

  output.textContent = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);
}

function clearAssetForm() {
  const titleEl = document.getElementById("createAssetTitle");
  const contentEl = document.getElementById("createAssetContent");
  const priorityEl = document.getElementById("createAssetPriority");

  if (titleEl) titleEl.value = "";
  if (contentEl) contentEl.value = "";
  if (priorityEl) priorityEl.value = "100";

  setCreateAssetResult("Asset form cleared.");
}

async function createProjectAsset() {
  const payload = getCreateAssetFormValues();

  if (!payload.project_code) {
    alert("project_code is required.");
    return;
  }

  if (!payload.asset_type) {
    alert("asset_type is required.");
    return;
  }

  if (!payload.title) {
    alert("title is required.");
    return;
  }

  if (!payload.content) {
    alert("content is required.");
    return;
  }

  setCreateAssetResult("Creating project asset...");

  try {
    const result = await AdminAPI.post("/ai/project/assets", payload);
    setCreateAssetResult(result);

    alert("Project asset creation request completed.");

    const assetProjectInput = document.getElementById("assetProjectCode");
    if (assetProjectInput) {
      assetProjectInput.value = payload.project_code;
    }

    await loadAssets();
  } catch (error) {
    setCreateAssetResult(`Error: ${error.message}`);
    alert(`Failed to create project asset: ${error.message}`);
  }
}

function renderConversationRows(rows) {
  const tbody = document.getElementById("conversationTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6">No conversation logs found.</td></tr>`;
    setConversationResultInfo("No conversation logs found.");
    return;
  }

  tbody.innerHTML = rows.slice(0, 100).map(row => {
    const conversationId = row.id ?? "";
    const userInput = row.user_input || row.question || row.message || "";

    return `
      <tr>
        <td>${conversationId}</td>
        <td>${escapeHtml(row.project_code ?? row.projectCode ?? "")}</td>
        <td>${escapeHtml(row.session_id ?? row.sessionId ?? "")}</td>
        <td class="preview-cell">${escapeHtml(String(userInput).slice(0, 180))}</td>
        <td>${formatDate(row.created_at ?? row.createdAt ?? "")}</td>
        <td class="action-cell">
          <button class="small-btn" onclick="loadConversationLogDetail(${conversationId})">View</button>
          <button class="small-btn" onclick="loadLinkedMemory(${conversationId})">Linked Memory</button>
        </td>
      </tr>
    `;
  }).join("");

  setConversationResultInfo(`${rows.length} conversation log item(s) loaded.`);
}

async function loadSessionLogs() {
  const tbody = document.getElementById("conversationTableBody");
  if (!tbody) return;

  const sessionId = getConversationSessionId();

  if (!sessionId) {
    alert("session_id is required.");
    return;
  }

  tbody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
  setConversationResultInfo(`Loading conversation logs for session_id=${sessionId}`);

  try {
    const data = await AdminAPI.get(`/ai/session/${encodeURIComponent(sessionId)}`);
    const rows = extractRows(data, ["logs", "conversations", "conversation_logs", "results"]);

    latestConversationRows = rows;

    renderConversationRows(rows);
  } catch (error) {
    latestConversationRows = [];
    tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(error.message)}</td></tr>`;
    setConversationResultInfo(`Error: ${error.message}`);
  }
}

async function loadLinkedMemory(conversationId) {
  const output = document.getElementById("linkedMemoryOutput");
  if (!output) return;

  if (!conversationId) {
    output.textContent = "conversation id is missing.";
    return;
  }

  output.textContent = `Loading linked memory for conversation #${conversationId}...`;

  try {
    const data = await AdminAPI.get(`/ai/conversation/${conversationId}`);

    const linkedMemories = data.linked_memories || data.data?.linked_memories || [];
    const linkedMemoriesCount = data.linked_memories_count ?? linkedMemories.length;

    output.textContent = JSON.stringify(
      {
        conversation_id: conversationId,
        linked_memories_count: linkedMemoriesCount,
        linked_memories: linkedMemories
      },
      null,
      2
    );
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
  }
}


function getContextBuildFormValues() {
  const projectCode = document.getElementById("contextBuildProjectCode")?.value?.trim() || "rbs_ai_memory";
  const sessionId = document.getElementById("contextBuildSessionId")?.value?.trim() || "";
  const userMessage = document.getElementById("contextBuildUserMessage")?.value?.trim() || "";
  const includeTextValue = document.getElementById("contextBuildIncludeText")?.value || "true";

  return {
    project_code: projectCode,
    session_id: sessionId,
    user_message: userMessage,
    include_text: includeTextValue !== "false"
  };
}

function setContextBuildResultInfo(message, className = null) {
  const el = document.getElementById("contextBuildResultInfo");
  if (!el) return;
  el.textContent = message;
  if (className) el.className = `result-info ${className}`;
}

function setContextBuildOutput(data) {
  const output = document.getElementById("contextBuildOutput");
  if (!output) return;

  output.textContent = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);
}

function setContextBuildTextOutput(value) {
  const output = document.getElementById("contextBuildTextOutput");
  if (!output) return;
  output.textContent = value || "No context text returned.";
}

function renderContextBuildSummary(result) {
  const summary = result?.summary || {};

  setText("contextBuildAssetsCount", summary.project_assets_count ?? 0);
  setText("contextBuildRecentCount", summary.recent_buffer_count ?? 0);
  setText("contextBuildMemoryCount", summary.summarized_memory_count ?? 0);
  setText(
    "contextBuildReadyStatus",
    summary.ready_for_ai_request ? "READY" : "NOT READY",
    summary.ready_for_ai_request ? "status-ok" : "status-warning"
  );
}

function clearContextBuildForm() {
  const userMessageEl = document.getElementById("contextBuildUserMessage");

  if (userMessageEl) {
    userMessageEl.value = "";
  }

  renderContextBuildSummary({ summary: {} });
  setContextBuildResultInfo("Context build form cleared.");
  setContextBuildTextOutput("No context text yet.");
  setContextBuildOutput("No context packet yet.");
}

async function runContextBuild() {
  const payload = getContextBuildFormValues();

  if (!payload.project_code) {
    alert("project_code is required.");
    return;
  }

  if (!payload.session_id) {
    alert("session_id is required.");
    return;
  }

  if (!payload.user_message) {
    alert("user_message is required.");
    return;
  }

  setContextBuildResultInfo("Building context packet...");
  setContextBuildTextOutput("Loading...");
  setContextBuildOutput("Loading...");

  try {
    const result = await AdminAPI.post("/ai/context/build", payload);

    renderContextBuildSummary(result);
    setContextBuildTextOutput(result.context_packet?.system_context_text || "No context text returned.");
    setContextBuildOutput(result);

    const warningsCount = result.summary?.warnings_count || 0;
    setContextBuildResultInfo(
      warningsCount > 0
        ? `Context packet built with ${warningsCount} warning(s).`
        : "Context packet built successfully.",
      warningsCount > 0 ? "status-warning" : "status-ok"
    );

    setRawOutput(result);
  } catch (error) {
    setContextBuildResultInfo(`Context build failed: ${error.message}`, "status-error");
    setContextBuildTextOutput(`Error: ${error.message}`);
    setContextBuildOutput(`Error: ${error.message}`);
  }
}

function getContextPreviewFormValues() {
  const projectCode = document.getElementById("contextProjectCode")?.value?.trim() || "rbs_ai_memory";
  const sessionId = document.getElementById("contextSessionId")?.value?.trim() || "";
  const question = document.getElementById("contextQuestion")?.value?.trim() || "";
  const includePromptValue = document.getElementById("contextPreviewIncludePrompt")?.value || "true";
  const includePacketValue = document.getElementById("contextPreviewIncludePacket")?.value || "true";

  return {
    project_code: projectCode,
    session_id: sessionId,
    question,
    include_prompt: includePromptValue !== "false",
    include_packet: includePacketValue !== "false"
  };
}

function setContextPreviewResultInfo(message, className = null) {
  const el = document.getElementById("contextPreviewResultInfo");
  if (!el) return;
  el.textContent = message;
  if (className) el.className = `result-info ${className}`;
}

function setContextPreviewOutput(data) {
  const output = document.getElementById("contextPreviewOutput");
  if (!output) return;

  output.textContent = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);
}

function setContextPreviewPre(id, data, fallback) {
  const output = document.getElementById(id);
  if (!output) return;

  if (data === null || data === undefined || data === "") {
    output.textContent = fallback || "-";
    return;
  }

  output.textContent = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);
}

function renderContextPreviewSummary(result) {
  const summary = result?.summary || {};
  const quality = result?.quality || {};
  const readinessStatus = summary.readiness_status || quality.readiness_status || "-";
  const readinessClass = readinessStatus === "READY"
    ? "status-ok"
    : readinessStatus === "NOT_READY"
      ? "status-error"
      : "status-warning";

  setText("contextPreviewReadinessStatus", readinessStatus, readinessClass);
  setText("contextPreviewReadinessScore", summary.readiness_score ?? quality.readiness_score ?? 0);
  setText("contextPreviewAssetsCount", summary.project_assets_count ?? 0);
  setText("contextPreviewRecentCount", summary.recent_buffer_count ?? 0);
  setText("contextPreviewMemoryCount", summary.summarized_memory_count ?? 0);
  setText("contextPreviewPromptLength", summary.prompt_length ?? quality.prompt_length ?? 0);

  setContextPreviewPre("contextPreviewQualityOutput", quality, "No quality summary yet.");
  setContextPreviewPre("contextPreviewKeywordOutput", result?.extracted_keywords || [], "No keywords yet.");
  setContextPreviewPre("contextPreviewLayerCardsOutput", result?.layer_cards || {}, "No layer cards yet.");
  setContextPreviewPre("contextPreviewPromptOutput", result?.final_prompt || "No final prompt returned.");
}

function clearContextPreviewForm() {
  const questionEl = document.getElementById("contextQuestion");

  if (questionEl) {
    questionEl.value = "";
  }

  setText("contextPreviewReadinessStatus", "-");
  setText("contextPreviewReadinessScore", 0);
  setText("contextPreviewAssetsCount", 0);
  setText("contextPreviewRecentCount", 0);
  setText("contextPreviewMemoryCount", 0);
  setText("contextPreviewPromptLength", 0);
  setContextPreviewResultInfo("Context preview form cleared.");
  setContextPreviewPre("contextPreviewQualityOutput", "No quality summary yet.");
  setContextPreviewPre("contextPreviewKeywordOutput", "No keywords yet.");
  setContextPreviewPre("contextPreviewLayerCardsOutput", "No layer cards yet.");
  setContextPreviewPre("contextPreviewPromptOutput", "No final prompt yet.");
  setContextPreviewOutput("No context preview result yet.");
}

async function runContextPreview() {
  const payload = getContextPreviewFormValues();

  if (!payload.project_code) {
    alert("project_code is required.");
    return;
  }

  if (!payload.session_id) {
    alert("session_id is required.");
    return;
  }

  if (!payload.question) {
    alert("question is required.");
    return;
  }

  setContextPreviewResultInfo("Running enhanced context preview...");
  setContextPreviewPre("contextPreviewQualityOutput", "Loading...");
  setContextPreviewPre("contextPreviewKeywordOutput", "Loading...");
  setContextPreviewPre("contextPreviewLayerCardsOutput", "Loading...");
  setContextPreviewPre("contextPreviewPromptOutput", "Loading...");
  setContextPreviewOutput("Loading...");

  try {
    const result = await AdminAPI.post("/ai/context/preview", payload);

    renderContextPreviewSummary(result);
    setContextPreviewOutput(result);
    setRawOutput(result);

    const status = result.summary?.readiness_status || "UNKNOWN";
    const warningsCount = result.summary?.warnings_count || 0;
    setContextPreviewResultInfo(
      `Context preview completed. Status: ${status}, warnings: ${warningsCount}`,
      status === "READY" ? "status-ok" : status === "NOT_READY" ? "status-error" : "status-warning"
    );
  } catch (error) {
    setContextPreviewResultInfo(`Error: ${error.message}`, "status-error");
    setContextPreviewPre("contextPreviewQualityOutput", `Error: ${error.message}`);
    setContextPreviewPre("contextPreviewKeywordOutput", "-");
    setContextPreviewPre("contextPreviewLayerCardsOutput", "-");
    setContextPreviewPre("contextPreviewPromptOutput", "-");
    setContextPreviewOutput(`Error: ${error.message}`);
  }
}

async function copyContextPreviewPrompt() {
  const output = document.getElementById("contextPreviewPromptOutput");
  const value = output?.textContent || "";

  if (!value || value === "No final prompt yet." || value.startsWith("Error:")) {
    alert("There is no final prompt to copy yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setContextPreviewResultInfo("Final prompt copied to clipboard.", "status-ok");
  } catch (error) {
    setContextPreviewResultInfo(`Copy failed: ${error.message}`, "status-error");
  }
}



function getContextAssemblyFormValues() {
  const projectCode = document.getElementById("assemblyProjectCode")?.value?.trim() || "rbs_ai_memory";
  const sessionId = document.getElementById("assemblySessionId")?.value?.trim() || "";
  const question = document.getElementById("assemblyQuestion")?.value?.trim() || "";

  return {
    project_code: projectCode,
    session_id: sessionId,
    question,
    project_asset_limit: Number(document.getElementById("assemblyAssetLimit")?.value || 12),
    recent_buffer_limit: Number(document.getElementById("assemblyRecentLimit")?.value || 8),
    summarized_memory_limit: Number(document.getElementById("assemblyMemoryLimit")?.value || 10),
    max_prompt_chars: Number(document.getElementById("assemblyMaxPromptChars")?.value || 12000)
  };
}

function setContextAssemblyResultInfo(message, className = null) {
  const el = document.getElementById("contextAssemblyResultInfo");
  if (!el) return;
  el.textContent = message;
  if (className) el.className = `result-info ${className}`;
}

function setAssemblyPre(id, data, fallback = "-") {
  const output = document.getElementById(id);
  if (!output) return;

  if (data === null || data === undefined || data === "") {
    output.textContent = fallback;
    return;
  }

  output.textContent = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);
}

function renderContextAssemblySummary(result) {
  const quality = result?.quality || {};
  const counts = quality?.counts || {};
  const status = quality.status || "-";
  const statusClass = status === "READY_FOR_PIPELINE"
    ? "status-ok"
    : status === "NOT_READY"
      ? "status-error"
      : "status-warning";

  setText("assemblyStatus", status, statusClass);
  setText("assemblyScore", quality.score ?? 0);
  setText("assemblyAssetsCount", counts.project_assets ?? 0);
  setText("assemblyRecentCount", counts.recent_buffer ?? 0);
  setText("assemblyMemoryCount", counts.summarized_memory ?? 0);
  setText("assemblyPromptLength", quality.prompt_length ?? 0);

  setAssemblyPre("assemblyTraceOutput", result?.assembly_trace || {}, "No assembly trace yet.");
  setAssemblyPre("assemblyWarningsOutput", result?.warnings || [], "No warnings yet.");
  setAssemblyPre("assemblyPromptOutput", result?.assembled_prompt || "", "No assembled prompt yet.");
  setAssemblyPre("assemblyOutput", result || {}, "No context assembly result yet.");
}

function clearContextAssemblyForm() {
  const questionEl = document.getElementById("assemblyQuestion");
  if (questionEl) questionEl.value = "";

  setText("assemblyStatus", "-");
  setText("assemblyScore", 0);
  setText("assemblyAssetsCount", 0);
  setText("assemblyRecentCount", 0);
  setText("assemblyMemoryCount", 0);
  setText("assemblyPromptLength", 0);
  setContextAssemblyResultInfo("Context assembly form cleared.");
  setAssemblyPre("assemblyTraceOutput", "No assembly trace yet.");
  setAssemblyPre("assemblyWarningsOutput", "No warnings yet.");
  setAssemblyPre("assemblyPromptOutput", "No assembled prompt yet.");
  setAssemblyPre("assemblyOutput", "No context assembly result yet.");
}

async function runContextAssembly() {
  const payload = getContextAssemblyFormValues();

  if (!payload.project_code) {
    alert("project_code is required.");
    return;
  }

  if (!payload.session_id) {
    alert("session_id is required.");
    return;
  }

  if (!payload.question) {
    alert("question is required.");
    return;
  }

  setContextAssemblyResultInfo("Building production context assembly...");
  setAssemblyPre("assemblyTraceOutput", "Loading...");
  setAssemblyPre("assemblyWarningsOutput", "Loading...");
  setAssemblyPre("assemblyPromptOutput", "Loading...");
  setAssemblyPre("assemblyOutput", "Loading...");

  try {
    const result = await AdminAPI.post("/ai/context/assembly", payload);
    renderContextAssemblySummary(result);
    setRawOutput(result);

    const status = result.quality?.status || "UNKNOWN";
    const warningsCount = result.warnings?.length || 0;
    setContextAssemblyResultInfo(
      `Context assembly completed. Status: ${status}, warnings: ${warningsCount}`,
      status === "READY_FOR_PIPELINE" ? "status-ok" : status === "NOT_READY" ? "status-error" : "status-warning"
    );
  } catch (error) {
    setContextAssemblyResultInfo(`Context assembly failed: ${error.message}`, "status-error");
    setAssemblyPre("assemblyTraceOutput", `Error: ${error.message}`);
    setAssemblyPre("assemblyWarningsOutput", "-");
    setAssemblyPre("assemblyPromptOutput", "-");
    setAssemblyPre("assemblyOutput", `Error: ${error.message}`);
  }
}

async function copyAssemblyPrompt() {
  const output = document.getElementById("assemblyPromptOutput");
  const value = output?.textContent || "";

  if (!value || value === "No assembled prompt yet." || value.startsWith("Error:")) {
    alert("There is no assembled prompt to copy yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setContextAssemblyResultInfo("Assembled prompt copied to clipboard.", "status-ok");
  } catch (error) {
    setContextAssemblyResultInfo(`Copy failed: ${error.message}`, "status-error");
  }
}

function scrollAdminToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
  const main = document.querySelector(".main");
  if (main) main.scrollTo({ top: 0, behavior: "smooth" });
}

function getPipelineDraftFormValues() {
  const projectCode = document.getElementById("pipelineProjectCode")?.value?.trim() || "rbs_ai_memory";
  const sessionId = document.getElementById("pipelineSessionId")?.value?.trim() || "";
  const question = document.getElementById("pipelineQuestion")?.value?.trim() || "";
  const dryRunValue = document.getElementById("pipelineDryRun")?.value || "true";
  const includePacketValue = document.getElementById("pipelineIncludePacket")?.value || "true";

  return {
    project_code: projectCode,
    session_id: sessionId,
    question,
    dry_run: dryRunValue !== "false",
    include_prompt: true,
    include_packet: includePacketValue !== "false"
  };
}

function setPipelineDraftResultInfo(message, className = null) {
  const el = document.getElementById("pipelineDraftResultInfo");
  if (!el) return;
  el.textContent = message;
  if (className) el.className = `result-info ${className}`;
}

function setPipelinePre(id, data, fallback = "-") {
  const output = document.getElementById(id);
  if (!output) return;

  if (data === null || data === undefined || data === "") {
    output.textContent = fallback;
    return;
  }

  output.textContent = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);
}

function renderPipelineDraftSummary(result) {
  const readiness = result?.readiness || {};
  const selectedModel = result?.selected_model || {};
  const metadata = result?.request_payload_preview?.metadata || {};
  const contextSummary = result?.context_summary || {};
  const status = readiness.status || "-";
  const statusClass = status === "READY_FOR_DRAFT_TEST"
    ? "status-ok"
    : status === "NOT_READY"
      ? "status-error"
      : "status-warning";

  setText("pipelineReadinessStatus", status, statusClass);
  setText("pipelineProvider", selectedModel.provider || "-");
  setText("pipelineModelName", selectedModel.model_name || selectedModel.model_code || "-");
  setText("pipelinePromptLength", metadata.prompt_length ?? 0);
  setText("pipelineContextScore", contextSummary.readiness_score ?? 0);
  setText("pipelineDryRunStatus", result?.dry_run ? "YES" : "NO");

  setPipelinePre("pipelineExecutionPlanOutput", result?.execution_plan || [], "No execution plan yet.");
  setPipelinePre("pipelineWarningsOutput", readiness, "No readiness summary yet.");
  setPipelinePre("pipelinePayloadOutput", result?.request_payload_preview || {}, "No request payload yet.");
  setPipelinePre("pipelineDraftOutput", result || {}, "No pipeline draft result yet.");
}

function clearPipelineDraftForm() {
  const questionEl = document.getElementById("pipelineQuestion");
  if (questionEl) questionEl.value = "";

  setText("pipelineReadinessStatus", "-");
  setText("pipelineProvider", "-");
  setText("pipelineModelName", "-");
  setText("pipelinePromptLength", 0);
  setText("pipelineContextScore", 0);
  setText("pipelineDryRunStatus", "-");
  setPipelineDraftResultInfo("Pipeline draft form cleared.");
  setPipelinePre("pipelineExecutionPlanOutput", "No execution plan yet.");
  setPipelinePre("pipelineWarningsOutput", "No warnings yet.");
  setPipelinePre("pipelinePayloadOutput", "No request payload yet.");
  setPipelinePre("pipelineDraftOutput", "No pipeline draft result yet.");
}

async function runPipelineDraft() {
  const payload = getPipelineDraftFormValues();

  if (!payload.project_code) {
    alert("project_code is required.");
    return;
  }

  if (!payload.session_id) {
    alert("session_id is required.");
    return;
  }

  if (!payload.question) {
    alert("question is required.");
    return;
  }

  setPipelineDraftResultInfo("Building AI request pipeline draft...");
  setPipelinePre("pipelineExecutionPlanOutput", "Loading...");
  setPipelinePre("pipelineWarningsOutput", "Loading...");
  setPipelinePre("pipelinePayloadOutput", "Loading...");
  setPipelinePre("pipelineDraftOutput", "Loading...");

  try {
    const result = await AdminAPI.post("/ai/request-pipeline/draft", payload);
    renderPipelineDraftSummary(result);
    setRawOutput(result);

    const status = result.readiness?.status || "UNKNOWN";
    const warningsCount = result.readiness?.warnings?.length || 0;
    setPipelineDraftResultInfo(
      `Pipeline draft completed. Status: ${status}, warnings: ${warningsCount}`,
      status === "READY_FOR_DRAFT_TEST" ? "status-ok" : status === "NOT_READY" ? "status-error" : "status-warning"
    );
  } catch (error) {
    setPipelineDraftResultInfo(`Pipeline draft failed: ${error.message}`, "status-error");
    setPipelinePre("pipelineExecutionPlanOutput", `Error: ${error.message}`);
    setPipelinePre("pipelineWarningsOutput", "-");
    setPipelinePre("pipelinePayloadOutput", "-");
    setPipelinePre("pipelineDraftOutput", `Error: ${error.message}`);
  }
}

async function copyPipelinePayload() {
  const output = document.getElementById("pipelinePayloadOutput");
  const value = output?.textContent || "";

  if (!value || value === "No request payload yet." || value.startsWith("Error:")) {
    alert("There is no request payload to copy yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setPipelineDraftResultInfo("Request payload copied to clipboard.", "status-ok");
  } catch (error) {
    setPipelineDraftResultInfo(`Copy failed: ${error.message}`, "status-error");
  }
}


function getResponseTestFormValues() {
  return {
    project_code: document.getElementById("responseTestProjectCode")?.value?.trim() || "rbs_ai_memory",
    session_id: document.getElementById("responseTestSessionId")?.value?.trim() || "phase-10-5-response-test-001",
    user_id: document.getElementById("responseTestUserId")?.value?.trim() || "admin-test-user",
    question: document.getElementById("responseTestQuestion")?.value?.trim() || "",
    save_to_memory: document.getElementById("responseTestSaveToMemory")?.value !== "false",
    include_prompt: true,
    include_packet: document.getElementById("responseTestIncludePacket")?.value === "true",
    use_assembly: document.getElementById("responseTestUseAssembly")?.value !== "false",
    recent_buffer_keep_limit: Number(document.getElementById("responseTestBufferKeepLimit")?.value || 10),
    create_summary_queue: document.getElementById("responseTestCreateSummaryQueue")?.value !== "false",
    use_provider_router: document.getElementById("responseTestUseProviderRouter")?.value !== "false",
    intent: document.getElementById("responseTestIntent")?.value || "general",
    preferred_provider: document.getElementById("responseTestPreferredProvider")?.value || null,
    force_provider: document.getElementById("responseTestForceProvider")?.value || null,
    live: document.getElementById("responseTestLive")?.value === "true",
    allow_fallback: document.getElementById("responseTestAllowFallback")?.value !== "false"
  };
}

function setResponseTestResultInfo(message, className) {
  const el = document.getElementById("responseTestResultInfo");
  if (!el) return;
  el.textContent = message;
  el.className = className ? `result-info ${className}` : "result-info";
}

function setResponseTestPre(id, value, fallback = "-") {
  const el = document.getElementById(id);
  if (!el) return;
  if (value === undefined || value === null || value === "") {
    el.textContent = fallback;
    return;
  }
  el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function renderResponseTestResult(result) {
  const selectedModel = result?.selected_model || {};
  const contextSummary = result?.context_summary || {};
  const stored = result?.stored || {};
  const status = result?.ok ? "COMPLETED" : "FAILED";

  setText("responseTestStatus", status);
  const router = result?.provider_router || {};
  const providerResult = result?.provider_result || {};

  setText("responseTestProvider", selectedModel.provider || router.selected_provider || "-");
  setText("responseTestModel", selectedModel.model_name || selectedModel.model_code || router.selected_model || "-");
  setText("responseTestRouterStatus", router.route_status || "NOT_USED");
  setText("responseTestLiveCall", providerResult?.response?.live_call || providerResult?.live_requested ? "YES" : "NO");
  setText("responseTestContextScore", contextSummary.readiness_score ?? contextSummary.score ?? 0);
  setText("responseTestLogId", stored.conversation_log_id || "-");
  setText("responseTestSummaryQueue", stored.summary_queue_created ? "CREATED" : "SKIPPED");
  setText("responseTestSummaryQueueId", stored.summary_queue_id || "-");
  setText("responseTestBufferAfterCleanup", stored.recent_buffer_cleanup?.after_count ?? "-");

  setResponseTestPre("responseTestAnswerOutput", result?.answer, "No answer yet.");
  setResponseTestPre("responseTestRouterOutput", {
    provider_router: result?.provider_router || null,
    selected_model: result?.selected_model || null,
    provider_result: result?.provider_result ? {
      ok: result.provider_result.ok,
      provider: result.provider_result.provider,
      adapter_status: result.provider_result.adapter_status,
      live_requested: result.provider_result.live_requested,
      live_mode_enabled: result.provider_result.live_mode_enabled,
      model_profile: result.provider_result.model_profile,
      safety: result.provider_result.safety || null
    } : null
  }, "No router result yet.");
  setResponseTestPre("responseTestExecutionOutput", result?.execution_plan || [], "No execution plan yet.");
  setResponseTestPre("responseTestContextSummaryOutput", {
    context_summary: result?.context_summary || null,
    context_assembly_summary: result?.context_assembly_summary || null,
    readiness: result?.readiness || null,
    stored: result?.stored || null
  }, "No context summary yet.");
  setResponseTestPre("responseTestPromptOutput", result?.final_prompt, "No final prompt yet.");
  setResponseTestPre("responseTestJsonOutput", result || {}, "No response test result yet.");
}

async function runResponseTest() {
  const payload = getResponseTestFormValues();

  if (!payload.project_code) {
    alert("project_code is required.");
    return;
  }

  if (!payload.session_id) {
    alert("session_id is required.");
    return;
  }

  if (!payload.question) {
    alert("question is required.");
    return;
  }

  setResponseTestResultInfo("Running memory-context response test...");
  setResponseTestPre("responseTestAnswerOutput", "Loading...");
  setResponseTestPre("responseTestRouterOutput", "Loading...");
  setResponseTestPre("responseTestExecutionOutput", "Loading...");
  setResponseTestPre("responseTestContextSummaryOutput", "Loading...");
  setResponseTestPre("responseTestPromptOutput", "Loading...");
  setResponseTestPre("responseTestJsonOutput", "Loading...");

  try {
    const result = await AdminAPI.post("/ai/response/test", payload);
    renderResponseTestResult(result);
    setRawOutput(result);
    const logId = result?.stored?.conversation_log_id || "not saved";
    setResponseTestResultInfo(`Response test completed. Conversation log: ${logId}`, "status-ok");
  } catch (error) {
    setResponseTestResultInfo(`Response test failed: ${error.message}`, "status-error");
    setResponseTestPre("responseTestAnswerOutput", `Error: ${error.message}`);
    setResponseTestPre("responseTestRouterOutput", "-");
    setResponseTestPre("responseTestExecutionOutput", "-");
    setResponseTestPre("responseTestContextSummaryOutput", "-");
    setResponseTestPre("responseTestPromptOutput", "-");
    setResponseTestPre("responseTestJsonOutput", `Error: ${error.message}`);
  }
}

async function copyResponseAnswer() {
  const output = document.getElementById("responseTestAnswerOutput");
  const value = output?.textContent || "";

  if (!value || value === "No answer yet." || value.startsWith("Error:")) {
    alert("There is no answer to copy yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setResponseTestResultInfo("Answer copied to clipboard.", "status-ok");
  } catch (error) {
    setResponseTestResultInfo(`Copy failed: ${error.message}`, "status-error");
  }
}

function clearResponseTestForm() {
  const questionEl = document.getElementById("responseTestQuestion");
  if (questionEl) questionEl.value = "";

  setText("responseTestStatus", "-");
  setText("responseTestProvider", "-");
  setText("responseTestModel", "-");
  setText("responseTestRouterStatus", "-");
  setText("responseTestLiveCall", "-");
  setText("responseTestContextScore", 0);
  setText("responseTestLogId", "-");
  setText("responseTestSummaryQueue", "-");
  setText("responseTestSummaryQueueId", "-");
  setText("responseTestBufferAfterCleanup", "-");
  setResponseTestResultInfo("Response test form cleared.");
  setResponseTestPre("responseTestAnswerOutput", "No answer yet.");
  setResponseTestPre("responseTestRouterOutput", "No router result yet.");
  setResponseTestPre("responseTestExecutionOutput", "No execution plan yet.");
  setResponseTestPre("responseTestContextSummaryOutput", "No context summary yet.");
  setResponseTestPre("responseTestPromptOutput", "No final prompt yet.");
  setResponseTestPre("responseTestJsonOutput", "No response test result yet.");
}


function getResponseStorageFormValues() {
  return {
    project_code: document.getElementById("responseStorageProjectCode")?.value?.trim() || "rbs_ai_memory",
    session_id: document.getElementById("responseStorageSessionId")?.value?.trim() || "phase-10-5-response-test-001",
    limit: Number(document.getElementById("responseStorageLimit")?.value || 10),
    keep_limit: Number(document.getElementById("responseStorageKeepLimit")?.value || 10)
  };
}

function setResponseStorageResultInfo(message, className) {
  const el = document.getElementById("responseStorageResultInfo");
  if (!el) return;
  el.textContent = message;
  el.className = className ? `result-info ${className}` : "result-info";
}

function setResponseStoragePre(id, value, fallback = "-") {
  const el = document.getElementById(id);
  if (!el) return;
  if (value === undefined || value === null || value === "") {
    el.textContent = fallback;
    return;
  }
  el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function renderResponseStorageStatus(result) {
  const counts = result?.counts || {};
  const latest = result?.latest || {};

  setText("responseStorageConversationCount", counts.conversation_logs ?? 0);
  setText("responseStorageRecentCount", counts.recent_buffer ?? 0);
  setText("responseStorageQueueCount", counts.summary_queue ?? 0);
  setText("responseStorageLatestLogId", latest.conversation_log?.id || "-");

  setResponseStoragePre("responseStorageConversationOutput", result?.conversation_logs || [], "No conversation logs loaded.");
  setResponseStoragePre("responseStorageRecentOutput", result?.recent_buffer || [], "No recent buffer loaded.");
  setResponseStoragePre("responseStorageQueueOutput", result?.summary_queue || [], "No summary queue loaded.");
  setResponseStoragePre("responseStorageJsonOutput", result || {}, "No storage status loaded.");
}

async function loadResponseStorageStatus() {
  const values = getResponseStorageFormValues();

  if (!values.project_code || !values.session_id) {
    alert("project_code and session_id are required.");
    return;
  }

  setResponseStorageResultInfo("Loading response storage status...");
  setResponseStoragePre("responseStorageJsonOutput", "Loading...");

  try {
    const query = new URLSearchParams({
      project_code: values.project_code,
      session_id: values.session_id,
      limit: String(values.limit || 10)
    }).toString();
    const result = await AdminAPI.get(`/ai/response/storage/status?${query}`);
    renderResponseStorageStatus(result);
    setRawOutput(result);
    setResponseStorageResultInfo("Response storage status loaded.", "status-ok");
  } catch (error) {
    setResponseStorageResultInfo(`Storage status load failed: ${error.message}`, "status-error");
    setResponseStoragePre("responseStorageJsonOutput", `Error: ${error.message}`);
  }
}

async function cleanupResponseRecentBuffer() {
  const values = getResponseStorageFormValues();

  if (!values.session_id) {
    alert("session_id is required.");
    return;
  }

  if (!confirm(`Cleanup recent buffer for session ${values.session_id}? Keep latest ${values.keep_limit} rows.`)) {
    return;
  }

  setResponseStorageResultInfo("Cleaning up recent buffer...");

  try {
    const result = await AdminAPI.post("/ai/response/storage/cleanup", {
      session_id: values.session_id,
      keep_limit: values.keep_limit
    });
    setRawOutput(result);
    setResponseStorageResultInfo(`Cleanup completed. Deleted: ${result?.result?.deleted_count || 0}`, "status-ok");
    await loadResponseStorageStatus();
  } catch (error) {
    setResponseStorageResultInfo(`Cleanup failed: ${error.message}`, "status-error");
  }
}

function getContextRebuildFormValues() {
  const projectCode = document.getElementById("rebuildProjectCode")?.value?.trim() || "rbs_ai_memory";
  const sessionId = document.getElementById("rebuildSessionId")?.value?.trim() || "";
  const question = document.getElementById("rebuildQuestion")?.value?.trim() || "";

  return {
    project_code: projectCode,
    session_id: sessionId,
    question
  };
}

function setContextRebuildResultInfo(message) {
  const el = document.getElementById("contextRebuildResultInfo");
  if (!el) return;
  el.textContent = message;
}

function setContextRebuildOutput(data) {
  const output = document.getElementById("contextRebuildOutput");
  if (!output) return;

  output.textContent = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);
}

function clearContextRebuildForm() {
  const sessionEl = document.getElementById("rebuildSessionId");
  const questionEl = document.getElementById("rebuildQuestion");

  if (sessionEl) {
    sessionEl.value = "";
  }

  if (questionEl) {
    questionEl.value = "";
  }

  setContextRebuildResultInfo("Context rebuild form cleared.");
  setContextRebuildOutput("No context rebuild result yet.");
}

async function runContextRebuild() {
  const payload = getContextRebuildFormValues();

  if (!payload.project_code) {
    alert("project_code is required.");
    return;
  }

  if (!payload.session_id) {
    alert("session_id is required.");
    return;
  }

  if (!payload.question) {
  alert("question is required.");
  return;
  }

  const confirmed = confirm(`Run context rebuild for session_id="${payload.session_id}"?`);
  if (!confirmed) return;

  setContextRebuildResultInfo("Running context rebuild...");
  setContextRebuildOutput("Loading...");

  try {
    const result = await AdminAPI.post("/ai/context/rebuild", payload);

    setContextRebuildResultInfo("Context rebuild request completed.");
    setContextRebuildOutput(result);
    setRawOutput(result);
  } catch (error) {
    setContextRebuildResultInfo(`Error: ${error.message}`);
    setContextRebuildOutput(`Error: ${error.message}`);
  }
}



function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function getOperationChecklistDate() {
  const el = document.getElementById("operationChecklistDate");
  return el?.value || todayDateInputValue();
}

function setOperationChecklistResultInfo(message, className = null) {
  setText("operationChecklistResultInfo", message, className);
}

function setOperationChecklistStatus(status) {
  const el = document.getElementById("operationChecklistStatus");
  if (!el) return;

  const value = status || "PENDING";
  el.textContent = value;
  el.className = "health-status";

  if (value === "DONE") {
    el.classList.add("health-status-good");
  } else if (value === "IN_PROGRESS") {
    el.classList.add("health-status-warning");
  } else {
    el.classList.add("health-status-muted");
  }
}

function renderOperationChecklist(data) {
  const rows = extractRows(data, ["results"]);
  const summary = data?.summary || {
    total: rows.length,
    done: rows.filter((row) => row.is_done).length,
    pending: rows.filter((row) => !row.is_done).length,
    completion_rate: 0,
    overall_status: "PENDING"
  };

  setOperationChecklistStatus(summary.overall_status);
  setText("operationChecklistRate", `${summary.completion_rate ?? 0}%`);
  setText("operationChecklistDone", summary.done ?? 0);
  setText("operationChecklistPending", summary.pending ?? 0);

  const tbody = document.getElementById("operationChecklistTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6">No checklist item found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const checked = row.is_done ? "checked" : "";
    const completedAt = row.completed_at ? formatDate(row.completed_at) : "-";
    const note = row.note || "";

    return `
      <tr class="${row.is_done ? "checklist-done-row" : ""}">
        <td>
          <input
            type="checkbox"
            class="operation-check-input"
            data-item-key="${escapeHtml(row.item_key)}"
            ${checked}
          />
        </td>
        <td>${escapeHtml(row.item_group)}</td>
        <td>${escapeHtml(row.item_label)}</td>
        <td>
          <input
            class="input operation-note-input"
            type="text"
            data-item-key="${escapeHtml(row.item_key)}"
            value="${escapeHtml(note)}"
            placeholder="Optional note"
          />
        </td>
        <td>${escapeHtml(completedAt)}</td>
        <td>
          <button
            class="secondary-btn small-btn operation-save-item-btn"
            data-item-key="${escapeHtml(row.item_key)}"
          >Save</button>
        </td>
      </tr>
    `;
  }).join("");

  bindOperationChecklistRowEvents();
}

function getOperationChecklistRowPayload(itemKey) {
  const checkbox = document.querySelector(`.operation-check-input[data-item-key="${CSS.escape(itemKey)}"]`);
  const noteInput = document.querySelector(`.operation-note-input[data-item-key="${CSS.escape(itemKey)}"]`);

  return {
    check_date: getOperationChecklistDate(),
    item_key: itemKey,
    is_done: Boolean(checkbox?.checked),
    note: noteInput?.value?.trim() || null
  };
}

async function saveOperationChecklistItem(itemKey) {
  if (!itemKey) return;

  setOperationChecklistResultInfo(`Saving checklist item: ${itemKey}...`);

  try {
    const payload = getOperationChecklistRowPayload(itemKey);
    const data = await AdminAPI.patch("/ai/system/daily-operation-checklist/item", payload);
    renderOperationChecklist(data);
    setOperationChecklistResultInfo("Checklist item saved.");
    setRawOutput(data);
  } catch (error) {
    setOperationChecklistResultInfo(`Checklist save failed: ${error.message}`, "status-error");
  }
}

function bindOperationChecklistRowEvents() {
  document.querySelectorAll(".operation-save-item-btn").forEach((button) => {
    button.addEventListener("click", () => {
      saveOperationChecklistItem(button.dataset.itemKey);
    });
  });

  document.querySelectorAll(".operation-check-input").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      saveOperationChecklistItem(checkbox.dataset.itemKey);
    });
  });
}

async function loadOperationChecklist() {
  const checkDate = getOperationChecklistDate();
  setOperationChecklistResultInfo(`Loading operation checklist for ${checkDate}...`);

  try {
    const data = await AdminAPI.get(`/ai/system/daily-operation-checklist?date=${encodeURIComponent(checkDate)}`);
    renderOperationChecklist(data);
    setOperationChecklistResultInfo(`Checklist loaded for ${data.check_date}.`);
    setRawOutput(data);
  } catch (error) {
    const tbody = document.getElementById("operationChecklistTableBody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(error.message)}</td></tr>`;
    }
    setOperationChecklistResultInfo(`Checklist load failed: ${error.message}`, "status-error");
  }
}

async function resetOperationChecklist() {
  const checkDate = getOperationChecklistDate();
  const confirmed = confirm(`Reset operation checklist for ${checkDate}?`);
  if (!confirmed) return;

  setOperationChecklistResultInfo(`Resetting checklist for ${checkDate}...`);

  try {
    const data = await AdminAPI.post("/ai/system/daily-operation-checklist/reset", {
      check_date: checkDate
    });
    renderOperationChecklist(data);
    setOperationChecklistResultInfo(`Checklist reset for ${data.check_date}.`);
    setRawOutput(data);
  } catch (error) {
    setOperationChecklistResultInfo(`Checklist reset failed: ${error.message}`, "status-error");
  }
}


// ======================================================
// Phase 9-5: Daily Automation UI
// ======================================================
function setAutomationResultInfo(message, className = null) {
  const el = document.getElementById("automationResultInfo");
  if (!el) return;
  el.textContent = message;
  if (className !== null) el.className = `result-info ${className}`;
}

function getAutomationPayload() {
  return {
    is_enabled: Boolean(document.getElementById("automationEnabled")?.checked),
    run_time: document.getElementById("automationRunTime")?.value || "09:00",
    timezone: document.getElementById("automationTimezone")?.value?.trim() || "Asia/Manila",
    save_health_check: Boolean(document.getElementById("automationSaveHealth")?.checked),
    auto_mark_checklist: Boolean(document.getElementById("automationMarkChecklist")?.checked),
    note: document.getElementById("automationNote")?.value?.trim() || null
  };
}

function renderAutomationConfig(data) {
  const config = data?.config || {};

  const enabled = document.getElementById("automationEnabled");
  const runTime = document.getElementById("automationRunTime");
  const timezone = document.getElementById("automationTimezone");
  const saveHealth = document.getElementById("automationSaveHealth");
  const markChecklist = document.getElementById("automationMarkChecklist");
  const note = document.getElementById("automationNote");

  if (enabled) enabled.checked = Boolean(config.is_enabled);
  if (runTime) runTime.value = config.run_time || "09:00";
  if (timezone) timezone.value = config.timezone || "Asia/Manila";
  if (saveHealth) saveHealth.checked = config.save_health_check !== false;
  if (markChecklist) markChecklist.checked = config.auto_mark_checklist !== false;
  if (note) note.value = config.note || "";

  const schedulerTime = data?.scheduler_time
    ? `${data.scheduler_time.date} ${data.scheduler_time.time}`
    : "-";

  setText("automationSchedulerTime", schedulerTime);
  setText("automationLastRunDate", config.last_run_date ? String(config.last_run_date).slice(0, 10) : "-");
  setText("automationLastRunAt", formatDate(config.last_run_at));
  setText("automationNextAction", data?.next_action || "-");
}

async function loadAutomationConfig() {
  setAutomationResultInfo("Loading automation config...");

  try {
    const data = await AdminAPI.get("/ai/system/daily-automation/config");
    renderAutomationConfig(data);
    setAutomationResultInfo("Automation config loaded.");
    setRawOutput(data);
  } catch (error) {
    setAutomationResultInfo(`Automation config load failed: ${error.message}`, "status-error");
  }
}

async function saveAutomationConfig() {
  setAutomationResultInfo("Saving automation config...");

  try {
    const data = await AdminAPI.patch("/ai/system/daily-automation/config", getAutomationPayload());
    renderAutomationConfig(data);
    setAutomationResultInfo("Automation config saved.", "status-ok");
    setRawOutput(data);
  } catch (error) {
    setAutomationResultInfo(`Automation config save failed: ${error.message}`, "status-error");
  }
}

async function runAutomationNow() {
  const confirmed = confirm("Run Daily Automation now? This will run Daily Health Check and may save the result to DB.");
  if (!confirmed) return;

  setAutomationResultInfo("Running daily automation now...");

  try {
    const data = await AdminAPI.post("/ai/system/daily-automation/run", {
      run_type: "manual",
      run_date: todayDateInputValue()
    });

    setText("automationLastResult", JSON.stringify(data, null, 2));
    setAutomationResultInfo(`Automation run completed. run_id=${data.run_id}, status=${data.overall_status}`, data.ok ? "status-ok" : "status-error");
    setRawOutput(data);
    await loadAutomationConfig();
    await loadAutomationHistory();
    await loadDailyHealthHistory();
    await loadOperationChecklist();
  } catch (error) {
    setAutomationResultInfo(`Automation run failed: ${error.message}`, "status-error");
  }
}

function renderAutomationHistory(rows) {
  const tbody = document.getElementById("automationHistoryTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9">No automation history found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const actions = Array.isArray(row.actions) ? row.actions.join("\n") : "";
    const errors = Array.isArray(row.errors) ? row.errors.join("\n") : "";

    return `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(String(row.run_date || "").slice(0, 10))}</td>
        <td>${escapeHtml(row.run_type || "-")}</td>
        <td>${statusBadge(row.overall_status)}</td>
        <td>${escapeHtml(row.health_check_id || "-")}</td>
        <td>${escapeHtml(formatDate(row.started_at))}</td>
        <td>${escapeHtml(formatDate(row.finished_at))}</td>
        <td><pre class="table-mini-pre">${escapeHtml(actions || "-")}</pre></td>
        <td><pre class="table-mini-pre">${escapeHtml(errors || "-")}</pre></td>
      </tr>
    `;
  }).join("");
}

async function loadAutomationHistory() {
  setAutomationResultInfo("Loading automation history...");

  try {
    const data = await AdminAPI.get("/ai/system/daily-automation/history?limit=10");
    const rows = extractRows(data);
    renderAutomationHistory(rows);
    setAutomationResultInfo(`Automation history loaded. Count: ${rows.length}`);
    setRawOutput(data);
  } catch (error) {
    const tbody = document.getElementById("automationHistoryTableBody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9">Error: ${escapeHtml(error.message)}</td></tr>`;
    }
    setAutomationResultInfo(`Automation history load failed: ${error.message}`, "status-error");
  }
}



// ======================================================
// Phase 9-6: Operation Logs + Automation Safety UI
// ======================================================
function setOperationSafetyResultInfo(message, className = null) {
  const el = document.getElementById("operationSafetyResultInfo");
  if (!el) return;
  el.textContent = message;
  if (className !== null) el.className = `result-info ${className}`;
}

function renderAutomationSafetyStatus(data) {
  const status = data?.safety_status || "UNKNOWN";
  setDailyStatusBadge("automationSafetyStatus", status);
  setText("automationActiveLocks", data?.active_locks?.length ?? 0);
  setText("automationRunningRecords", data?.running_automation_runs?.length ?? 0);
  setText("automationRecentLogCounts", `${data?.recent_24h?.errors ?? 0} / ${data?.recent_24h?.warnings ?? 0}`);
  setText("automationLockDetail", JSON.stringify(data?.active_locks || [], null, 2));
  setText("automationSafetyWarnings", data?.warnings?.length ? data.warnings.join("\n") : "No warnings");
  setText("automationSafetyErrors", data?.errors?.length ? data.errors.join("\n") : "No errors");
}

async function loadAutomationSafetyStatus() {
  setOperationSafetyResultInfo("Loading automation safety status...");

  try {
    const data = await AdminAPI.get("/ai/system/daily-automation/safety");
    renderAutomationSafetyStatus(data);
    setOperationSafetyResultInfo(`Safety status loaded: ${data.safety_status}`, data.safety_status === "GOOD" ? "status-ok" : "status-error");
    setRawOutput(data);
  } catch (error) {
    setOperationSafetyResultInfo(`Safety status load failed: ${error.message}`, "status-error");
  }
}

async function unlockAutomationLock() {
  const confirmed = confirm("Release daily automation lock? Use this only when a previous worker/run is stuck.");
  if (!confirmed) return;

  setOperationSafetyResultInfo("Releasing daily automation lock...");

  try {
    const data = await AdminAPI.post("/ai/system/daily-automation/unlock", {
      lock_key: "daily_operation_automation"
    });
    setOperationSafetyResultInfo(`Unlock completed. released_count=${data.released_count}`, "status-ok");
    setRawOutput(data);
    await loadAutomationSafetyStatus();
    await loadOperationLogs();
  } catch (error) {
    setOperationSafetyResultInfo(`Unlock failed: ${error.message}`, "status-error");
  }
}

function getOperationLogFilters() {
  return {
    level: document.getElementById("operationLogLevelFilter")?.value || "all",
    category: document.getElementById("operationLogCategoryFilter")?.value?.trim() || "all",
    limit: 50
  };
}

function renderOperationLogs(rows) {
  const tbody = document.getElementById("operationLogsTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7">No operation logs found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const ref = [row.ref_type, row.ref_id].filter(Boolean).join("#") || "-";
    return `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(formatDate(row.created_at))}</td>
        <td>${statusBadge(row.log_level)}</td>
        <td>${escapeHtml(row.category || "-")}</td>
        <td>${escapeHtml(row.action || "-")}</td>
        <td><pre class="table-mini-pre">${escapeHtml(row.message || "-")}</pre></td>
        <td>${escapeHtml(ref)}</td>
      </tr>
    `;
  }).join("");
}

async function loadOperationLogs() {
  setOperationSafetyResultInfo("Loading operation logs...");

  try {
    const filters = getOperationLogFilters();
    const params = new URLSearchParams();
    params.set("limit", String(filters.limit));
    if (filters.level && filters.level !== "all") params.set("level", filters.level);
    if (filters.category && filters.category !== "all") params.set("category", filters.category);

    const data = await AdminAPI.get(`/ai/system/operation-logs?${params.toString()}`);
    const rows = extractRows(data);
    renderOperationLogs(rows);
    setOperationSafetyResultInfo(`Operation logs loaded. Count: ${rows.length}`);
    setRawOutput(data);
  } catch (error) {
    const tbody = document.getElementById("operationLogsTableBody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(error.message)}</td></tr>`;
    setOperationSafetyResultInfo(`Operation logs load failed: ${error.message}`, "status-error");
  }
}

async function saveManualOperationLog() {
  const message = document.getElementById("manualLogMessage")?.value?.trim();
  if (!message) {
    alert("Message is required.");
    return;
  }

  setOperationSafetyResultInfo("Saving manual operation log...");

  try {
    const data = await AdminAPI.post("/ai/system/operation-logs", {
      log_level: document.getElementById("manualLogLevel")?.value || "INFO",
      category: document.getElementById("manualLogCategory")?.value?.trim() || "manual",
      action: document.getElementById("manualLogAction")?.value?.trim() || "manual_operation_note",
      message,
      actor: "admin"
    });

    const messageEl = document.getElementById("manualLogMessage");
    if (messageEl) messageEl.value = "";

    setOperationSafetyResultInfo(`Manual log saved. id=${data.id}`, "status-ok");
    setRawOutput(data);
    await loadOperationLogs();
  } catch (error) {
    setOperationSafetyResultInfo(`Manual log save failed: ${error.message}`, "status-error");
  }
}

async function cleanupOperationLogs() {
  const days = Number(document.getElementById("operationLogCleanupDays")?.value || 30);
  const confirmed = confirm(`Delete operation logs older than ${days} days? Minimum cleanup age is 7 days.`);
  if (!confirmed) return;

  setOperationSafetyResultInfo("Cleaning old operation logs...");

  try {
    const data = await AdminAPI.post("/ai/system/operation-logs/cleanup", {
      older_than_days: days
    });
    setOperationSafetyResultInfo(`Cleanup completed. deleted_count=${data.deleted_count}`, "status-ok");
    setRawOutput(data);
    await loadOperationLogs();
  } catch (error) {
    setOperationSafetyResultInfo(`Cleanup failed: ${error.message}`, "status-error");
  }
}



function getOperationReportDate() {
  const el = document.getElementById("operationReportDate");
  return el?.value || todayDateInputValue();
}

function setOperationReportResultInfo(message, className = null) {
  const el = document.getElementById("operationReportResultInfo");
  if (!el) return;
  el.textContent = message;
  if (className !== null) el.className = `result-info ${className}`;
}

function renderOperationReportSummary(data) {
  const status = data?.overall_status || "UNKNOWN";
  const statusClass = status === "GOOD"
    ? "health-status health-status-good"
    : status === "WARNING"
      ? "health-status health-status-warning"
      : "health-status health-status-error";

  setText("operationReportOverallStatus", status, statusClass);
  setText("operationReportDateLabel", data?.report_date || "-");
  setText("operationReportGeneratedAt", formatDate(data?.generated_at));

  setText("reportHealthCount", data?.daily_health?.total_count ?? 0);
  setText("reportHealthDetail", `GOOD ${data?.daily_health?.good_count ?? 0} / WARNING ${data?.daily_health?.warning_count ?? 0} / ERROR ${data?.daily_health?.error_count ?? 0}`);

  setText("reportAutomationCount", data?.daily_automation?.total_count ?? 0);
  setText("reportAutomationDetail", `GOOD ${data?.daily_automation?.good_count ?? 0} / WARNING ${data?.daily_automation?.warning_count ?? 0} / ERROR ${data?.daily_automation?.error_count ?? 0}`);

  const checklistSummary = data?.daily_checklist?.summary || {};
  setText("reportChecklistPercent", `${checklistSummary.percent ?? 0}%`);
  setText("reportChecklistDetail", `Done ${checklistSummary.done ?? 0} / Pending ${checklistSummary.pending ?? 0}`);

  setText("reportOperationLogCount", data?.operation_logs?.total_count ?? 0);
  setText("reportOperationLogDetail", `INFO ${data?.operation_logs?.info_count ?? 0} / WARNING ${data?.operation_logs?.warning_count ?? 0} / ERROR ${data?.operation_logs?.error_count ?? 0}`);

  setText("reportQueueStatus", `${data?.summary_queue?.failed_count ?? 0} / ${data?.summary_queue?.pending_count ?? 0}`);

  const phase9Summary = data?.phase9_final?.summary || {};
  setText("reportPhase9FinalPercent", `${phase9Summary.percent ?? 0}%`);
  setText("reportPhase9FinalDetail", `${data?.phase9_final?.final_status || "-"} · Done ${phase9Summary.done ?? 0} / ${phase9Summary.total ?? 0}`);

  setText("operationReportWarnings", data?.warnings?.length ? data.warnings.join("\n") : "No warnings");
  setText("operationReportErrors", data?.errors?.length ? data.errors.join("\n") : "No errors");

  let decision = "Phase 9 is not ready for final completion yet.";
  if (status === "GOOD" && data?.phase9_final?.final_status === "READY") {
    decision = "Phase 9 can be marked as completed. Next recommended step: Phase 10 actual AI response pipeline integration.";
  } else if (status === "GOOD") {
    decision = "Daily operation status is GOOD. Complete the remaining Phase 9 Final Checklist items before final approval.";
  } else if (status === "WARNING") {
    decision = "Review warnings first. Phase 9 can continue, but final approval should wait until warnings are cleared or accepted.";
  } else {
    decision = "Resolve errors before Phase 9 final approval.";
  }

  setText("operationReportDecision", decision);

  if (data?.phase9_final) {
    renderPhase9FinalChecklist(data.phase9_final);
  }
}

async function loadOperationReportSummary() {
  setOperationReportResultInfo("Loading operation report summary...");

  try {
    const reportDate = getOperationReportDate();
    const data = await AdminAPI.get(`/ai/system/operation-report/summary?date=${encodeURIComponent(reportDate)}`);
    renderOperationReportSummary(data);
    setOperationReportResultInfo(`Operation report loaded. Status: ${data.overall_status}`, data.overall_status === "GOOD" ? "status-ok" : data.overall_status === "WARNING" ? "status-warning" : "status-error");
    setRawOutput(data);
  } catch (error) {
    setOperationReportResultInfo(`Operation report load failed: ${error.message}`, "status-error");
  }
}

function renderPhase9FinalChecklist(data) {
  const tbody = document.getElementById("phase9FinalChecklistTableBody");
  if (!tbody) return;

  const summary = data?.summary || { total: 0, done: 0, pending: 0, percent: 0 };
  setText("phase9FinalStatus", data?.final_status || "-");
  setText("phase9FinalCompletion", `${summary.percent || 0}%`);
  setText("phase9FinalDonePending", `${summary.done || 0} / ${summary.pending || 0}`);
  setText("phase9FinalChecklistInfo", `Phase 9 final checklist loaded. ${summary.done || 0}/${summary.total || 0} completed.`);

  const rows = data?.items || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6">No Phase 9 final checklist items found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const checked = row.is_done ? "checked" : "";
    return `
      <tr>
        <td><input type="checkbox" class="phase9-final-checkbox" data-item-key="${escapeHtml(row.item_key)}" ${checked} /></td>
        <td>${escapeHtml(row.item_group || "-")}</td>
        <td>${escapeHtml(row.item_label || "-")}</td>
        <td><input class="input phase9-final-note" data-item-key="${escapeHtml(row.item_key)}" type="text" value="${escapeHtml(row.note || "")}" placeholder="Optional note" /></td>
        <td>${escapeHtml(formatDate(row.completed_at) || "-")}</td>
        <td><button class="secondary-btn phase9-final-save-btn" data-item-key="${escapeHtml(row.item_key)}">Save</button></td>
      </tr>
    `;
  }).join("");

  document.querySelectorAll(".phase9-final-checkbox").forEach((box) => {
    box.addEventListener("change", async (event) => {
      const itemKey = event.target.dataset.itemKey;
      const note = document.querySelector(`.phase9-final-note[data-item-key="${CSS.escape(itemKey)}"]`)?.value || "";
      await updatePhase9FinalChecklistItem(itemKey, event.target.checked, note);
    });
  });

  document.querySelectorAll(".phase9-final-save-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const itemKey = event.target.dataset.itemKey;
      const checked = document.querySelector(`.phase9-final-checkbox[data-item-key="${CSS.escape(itemKey)}"]`)?.checked || false;
      const note = document.querySelector(`.phase9-final-note[data-item-key="${CSS.escape(itemKey)}"]`)?.value || "";
      await updatePhase9FinalChecklistItem(itemKey, checked, note);
    });
  });
}


function renderPhase9FinalDecision(data) {
  const status = data?.decision_status || "UNKNOWN";
  const statusClass = status === "READY_FOR_PHASE_10"
    ? "status-ok"
    : status === "READY_WITH_WARNINGS"
      ? "status-warning"
      : "status-error";

  setText("phase9FinalDecisionStatus", status, statusClass);
  setText("phase9FinalDecisionDetail", data?.decision_message || "-");

  const output = document.getElementById("phase9FinalDecisionOutput");
  if (output) {
    const requiredActions = data?.required_actions?.length
      ? data.required_actions.map((item, index) => `${index + 1}. ${item}`).join("\n")
      : "No required actions.";

    const acceptedWarnings = data?.accepted_warnings?.length
      ? data.accepted_warnings.map((item, index) => `${index + 1}. ${item}`).join("\n")
      : "No accepted warnings.";

    output.textContent = [
      `Decision: ${status}`,
      `Phase 10 Entry Allowed: ${data?.phase10_entry_allowed ? "YES" : "NO"}`,
      `Message: ${data?.decision_message || "-"}`,
      "",
      "Required Actions:",
      requiredActions,
      "",
      "Accepted Warnings:",
      acceptedWarnings,
      "",
      "Phase 10 Recommended First Task:",
      data?.phase10_start_scope?.recommended_first_task || "-",
      "",
      "Verification Summary:",
      JSON.stringify(data?.verification_summary || {}, null, 2)
    ].join("\n");
  }
}

async function runPhase9FinalDecision() {
  setOperationReportResultInfo("Running Phase 9 final decision...");

  try {
    const reportDate = getOperationReportDate();
    const data = await AdminAPI.get(`/ai/system/phase9-final-decision?date=${encodeURIComponent(reportDate)}`);
    renderPhase9FinalDecision(data);
    if (data?.report) {
      renderOperationReportSummary(data.report);
      renderPhase9FinalDecision(data);
    }
    setOperationReportResultInfo(
      `Phase 9 final decision: ${data.decision_status}`,
      data.phase10_entry_allowed ? "status-ok" : "status-warning"
    );
    setRawOutput(data);
  } catch (error) {
    setOperationReportResultInfo(`Phase 9 final decision failed: ${error.message}`, "status-error");
  }
}

async function loadPhase9FinalChecklist() {
  setOperationReportResultInfo("Loading Phase 9 final checklist...");

  try {
    const data = await AdminAPI.get("/ai/system/phase9-final-checklist");
    renderPhase9FinalChecklist(data);
    setOperationReportResultInfo(`Phase 9 final checklist loaded. Completion: ${data.summary?.percent || 0}%`);
    setRawOutput(data);
  } catch (error) {
    setOperationReportResultInfo(`Phase 9 final checklist load failed: ${error.message}`, "status-error");
  }
}

async function updatePhase9FinalChecklistItem(itemKey, isDone, note) {
  setOperationReportResultInfo("Saving Phase 9 final checklist item...");

  try {
    const data = await AdminAPI.patch("/ai/system/phase9-final-checklist/item", {
      item_key: itemKey,
      is_done: Boolean(isDone),
      note: note || null
    });

    renderPhase9FinalChecklist(data);
    setOperationReportResultInfo(`Checklist item saved. Completion: ${data.summary?.percent || 0}%`, "status-ok");
    setRawOutput(data);
  } catch (error) {
    setOperationReportResultInfo(`Checklist item save failed: ${error.message}`, "status-error");
  }
}

async function resetPhase9FinalChecklist() {
  const confirmed = confirm("Reset all Phase 9 final checklist items?");
  if (!confirmed) return;

  setOperationReportResultInfo("Resetting Phase 9 final checklist...");

  try {
    const data = await AdminAPI.post("/ai/system/phase9-final-checklist/reset", {});
    renderPhase9FinalChecklist(data);
    setOperationReportResultInfo("Phase 9 final checklist reset completed.", "status-ok");
    setRawOutput(data);
  } catch (error) {
    setOperationReportResultInfo(`Phase 9 final checklist reset failed: ${error.message}`, "status-error");
  }
}



function getSummaryWorkerPayload() {
  return {
    project_code: document.getElementById("summaryWorkerProjectCode")?.value?.trim() || "rbs_ai_memory",
    session_id: document.getElementById("summaryWorkerSessionId")?.value?.trim() || "",
    limit: Number(document.getElementById("summaryWorkerBatchLimit")?.value || 5),
    max_batches: Number(document.getElementById("summaryWorkerMaxBatches")?.value || 3)
  };
}

function setSummaryWorkerInfo(message) {
  const el = document.getElementById("summaryWorkerResultInfo");
  if (!el) return;
  el.textContent = message;
}

function setSummaryWorkerPre(id, value, fallback = "-") {
  const el = document.getElementById(id);
  if (!el) return;

  if (value === undefined || value === null || value === "") {
    el.textContent = fallback;
    return;
  }

  if (typeof value === "string") {
    el.textContent = value;
    return;
  }

  el.textContent = JSON.stringify(value, null, 2);
}

function renderSummaryWorkerStatus(result) {
  const counts = result?.counts || result?.final_counts || result?.after_counts || {};
  const recentMemory = result?.recent_summary_memory || [];
  const status = result?.worker_status || result?.integration_status || result?.mode || "-";

  setText("summaryWorkerStatus", status);
  setText("summaryWorkerPending", counts.pending ?? 0);
  setText("summaryWorkerProcessing", counts.processing ?? 0);
  setText("summaryWorkerCompleted", counts.completed ?? 0);
  setText("summaryWorkerFailed", counts.failed ?? 0);
  setText("summaryWorkerRecentMemory", Array.isArray(recentMemory) ? recentMemory.length : 0);

  setSummaryWorkerPre("summaryWorkerCommandsOutput", result?.commands || {
    run_once: "npm run worker:summary",
    run_loop: "npm run worker:summary:loop"
  });
  setSummaryWorkerPre("summaryWorkerWarningsOutput", {
    warnings: result?.warnings || [],
    errors: result?.errors || []
  });
  setSummaryWorkerPre("summaryWorkerQueueOutput", result?.recent_queue || result?.results || result?.batches || []);
  setSummaryWorkerPre("summaryWorkerMemoryOutput", recentMemory || []);
  setSummaryWorkerPre("summaryWorkerJsonOutput", result || {}, "No summary worker result loaded.");
}

async function loadSummaryWorkerStatus() {
  const payload = getSummaryWorkerPayload();
  setSummaryWorkerInfo("Loading summary worker status...");
  setSummaryWorkerPre("summaryWorkerJsonOutput", "Loading...");

  try {
    const url = `/ai/summary/worker-status?project_code=${encodeURIComponent(payload.project_code)}&limit=${encodeURIComponent(payload.limit)}`;
    const result = await AdminAPI.get(url);
    renderSummaryWorkerStatus(result);
    setSummaryWorkerInfo(`Worker status loaded. status=${result.worker_status || "-"}`);
  } catch (error) {
    setSummaryWorkerInfo(`Worker status load failed: ${error.message}`);
    setSummaryWorkerPre("summaryWorkerJsonOutput", `Error: ${error.message}`);
  }
}

async function processSummaryQueueBatchFromAdmin() {
  const payload = getSummaryWorkerPayload();
  const confirmed = confirm(`Process up to ${payload.limit} pending summary queue item(s)?`);
  if (!confirmed) return;

  setSummaryWorkerInfo("Processing summary queue batch...");

  try {
    const result = await AdminAPI.post("/ai/summary/process-batch", {
      project_code: payload.project_code,
      limit: payload.limit
    });
    renderSummaryWorkerStatus(result);
    setSummaryWorkerInfo(`Batch completed. success=${result.success || 0}, failed=${result.failed || 0}, pulled=${result.pulled_count || 0}`);
    await loadQueue();
  } catch (error) {
    setSummaryWorkerInfo(`Batch process failed: ${error.message}`);
    setSummaryWorkerPre("summaryWorkerJsonOutput", `Error: ${error.message}`);
  }
}

async function drainSummaryQueueFromAdmin() {
  const payload = getSummaryWorkerPayload();
  const confirmed = confirm(`Drain pending summary queue? limit_per_batch=${payload.limit}, max_batches=${payload.max_batches}`);
  if (!confirmed) return;

  setSummaryWorkerInfo("Draining pending summary queue...");

  try {
    const result = await AdminAPI.post("/ai/summary/drain", {
      project_code: payload.project_code,
      limit_per_batch: payload.limit,
      max_batches: payload.max_batches
    });
    renderSummaryWorkerStatus(result);
    setSummaryWorkerInfo(`Drain completed. total_success=${result.total_success || 0}, total_failed=${result.total_failed || 0}`);
    await loadQueue();
  } catch (error) {
    setSummaryWorkerInfo(`Drain failed: ${error.message}`);
    setSummaryWorkerPre("summaryWorkerJsonOutput", `Error: ${error.message}`);
  }
}

async function loadSummaryIntegrationStatus() {
  const payload = getSummaryWorkerPayload();
  setSummaryWorkerInfo("Loading summary integration status...");

  try {
    const params = new URLSearchParams({
      project_code: payload.project_code,
      limit: String(payload.limit)
    });
    if (payload.session_id) params.set("session_id", payload.session_id);

    const result = await AdminAPI.get(`/ai/summary/integration-status?${params.toString()}`);
    renderSummaryWorkerStatus(result);
    setSummaryWorkerInfo(`Integration status loaded. status=${result.integration_status || "-"}`);
  } catch (error) {
    setSummaryWorkerInfo(`Integration status failed: ${error.message}`);
    setSummaryWorkerPre("summaryWorkerJsonOutput", `Error: ${error.message}`);
  }
}


function phase10FinalPayload() {
  return {
    project_code: document.getElementById("phase10FinalProjectCode")?.value?.trim() || "rbs_ai_memory",
    session_id: document.getElementById("phase10FinalSessionId")?.value?.trim() || "phase-10-final-decision-test",
    question: document.getElementById("phase10FinalQuestion")?.value?.trim() || "Phase 10 Final에서 실제 AI 응답 파이프라인 완료 여부를 점검합니다.",
    run_response_smoke_test: document.getElementById("phase10FinalRunSmoke")?.value === "true",
    save_smoke_test_to_memory: document.getElementById("phase10FinalSaveSmoke")?.value === "true",
    process_summary_batch: document.getElementById("phase10FinalProcessBatch")?.value === "true",
    summary_batch_limit: Number(document.getElementById("phase10FinalBatchLimit")?.value || 3)
  };
}

function setPhase10FinalInfo(message) {
  const el = document.getElementById("phase10FinalResultInfo");
  if (!el) return;
  el.textContent = message;
}

function setPhase10FinalPre(id, value, fallback = "-") {
  const el = document.getElementById(id);
  if (!el) return;
  if (value === undefined || value === null || value === "") {
    el.textContent = fallback;
    return;
  }
  el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function renderPhase10FinalChecklist(items) {
  const body = document.getElementById("phase10FinalChecklistBody");
  if (!body) return;
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4">No final checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((item) => `
    <tr>
      <td>${item.group || "-"}</td>
      <td>${item.label || item.key || "-"}</td>
      <td>${statusBadge(item.status || "-")}</td>
      <td>${item.required ? "Yes" : "No"}</td>
    </tr>
  `).join("");
}

function renderPhase10FinalDecision(result) {
  const summary = result?.readiness_summary || {};
  const completion = result?.completion || {};

  setText("phase10FinalDecisionStatus", result?.decision_status || "-");
  setText("phase10FinalEntryAllowed", result?.phase11_entry_allowed ? "ALLOWED" : "BLOCKED");
  setText("phase10FinalCompletion", `${completion.completion_percent ?? 0}%`);
  setText("phase10FinalContextStatus", summary.context_assembly_status || "-");
  setText("phase10FinalPipelineStatus", summary.pipeline_status || "-");
  setText("phase10FinalWorkerStatus", summary.summary_worker_status || "-");

  renderPhase10FinalChecklist(result?.final_checklist || []);
  setPhase10FinalPre("phase10FinalWarningsOutput", result?.warnings || [], "No warnings");
  setPhase10FinalPre("phase10FinalErrorsOutput", result?.errors || [], "No errors");
  setPhase10FinalPre("phase10FinalMessageOutput", result?.decision_message || "-");
  setPhase10FinalPre("phase10FinalJsonOutput", result || {}, "No final decision result loaded.");
}

async function runPhase10FinalDecision() {
  const payload = phase10FinalPayload();
  setPhase10FinalInfo("Running Phase 10 final decision...");
  setPhase10FinalPre("phase10FinalJsonOutput", "Loading...");

  try {
    const result = await AdminAPI.post("/ai/system/phase10-final-decision", payload);
    renderPhase10FinalDecision(result);
    setPhase10FinalInfo(`Decision completed. status=${result.decision_status || "-"}, phase11_entry_allowed=${result.phase11_entry_allowed ? "true" : "false"}`);
  } catch (error) {
    setPhase10FinalInfo(`Phase 10 final decision failed: ${error.message}`);
    setPhase10FinalPre("phase10FinalErrorsOutput", `Error: ${error.message}`);
    setPhase10FinalPre("phase10FinalJsonOutput", `Error: ${error.message}`);
  }
}

function clearPhase10FinalDecision() {
  setPhase10FinalInfo("Waiting for Phase 10 final decision...");
  setText("phase10FinalDecisionStatus", "-");
  setText("phase10FinalEntryAllowed", "-");
  setText("phase10FinalCompletion", "0%");
  setText("phase10FinalContextStatus", "-");
  setText("phase10FinalPipelineStatus", "-");
  setText("phase10FinalWorkerStatus", "-");
  renderPhase10FinalChecklist([]);
  setPhase10FinalPre("phase10FinalWarningsOutput", "No warnings loaded.");
  setPhase10FinalPre("phase10FinalErrorsOutput", "No errors loaded.");
  setPhase10FinalPre("phase10FinalMessageOutput", "No decision loaded.");
  setPhase10FinalPre("phase10FinalJsonOutput", "No final decision result loaded.");
  setPhase10FinalPre("phase10CompletionReportOutput", "No completion report loaded.");
}


async function loadPhase10CompletionReport() {
  const payload = phase10FinalPayload();
  setPhase10FinalInfo("Loading Phase 10 completion report...");
  setPhase10FinalPre("phase10CompletionReportOutput", "Loading...");

  try {
    const result = await AdminAPI.post("/ai/system/phase10-completion-report", payload);
    setPhase10FinalPre("phase10CompletionReportOutput", result || {}, "No completion report loaded.");
    const status = result?.completion_report?.completion_status || "-";
    const next = result?.next_step || "-";
    setPhase10FinalInfo(`Completion report loaded. status=${status}. next=${next}`);
  } catch (error) {
    setPhase10FinalInfo(`Phase 10 completion report failed: ${error.message}`);
    setPhase10FinalPre("phase10CompletionReportOutput", `Error: ${error.message}`);
  }
}


// ======================================================
// Phase 11-1: Model Providers / Profile Normalization
// ======================================================
function setModelProviderInfo(message) {
  setText("modelProviderResultInfo", message || "-");
}

function renderProviderCatalog(providers) {
  const body = document.getElementById("modelProvidersTableBody");
  if (!body) return;

  if (!providers || !providers.length) {
    body.innerHTML = '<tr><td colspan="5">No providers loaded.</td></tr>';
    return;
  }

  body.innerHTML = providers.map((provider) => `
    <tr>
      <td><strong>${provider.provider_name || provider.provider}</strong><br><span class="muted-text">${provider.provider}</span></td>
      <td>${provider.default_model || "-"}</td>
      <td>${provider.api_key_configured ? statusBadge("configured") : statusBadge("missing")}</td>
      <td>${statusBadge(provider.status || "-")}</td>
      <td>${provider.live_supported ? "Supported" : "Prepared"}</td>
    </tr>
  `).join("");
}

function renderNormalizedProfiles(profiles) {
  const body = document.getElementById("normalizedProfilesTableBody");
  if (!body) return;

  if (!profiles || !profiles.length) {
    body.innerHTML = '<tr><td colspan="6">No profiles loaded.</td></tr>';
    return;
  }

  body.innerHTML = profiles.map((profile) => `
    <tr>
      <td><strong>${profile.model_code || "-"}</strong><br><span class="muted-text">${profile.display_name || ""}</span></td>
      <td>${profile.provider || "-"}</td>
      <td>${profile.model_name || "-"}</td>
      <td>${profile.is_active ? statusBadge("active") : statusBadge("inactive")}</td>
      <td>${profile.max_input_tokens ?? "-"}</td>
      <td>${profile.max_output_tokens ?? "-"}</td>
    </tr>
  `).join("");
}

async function loadModelProviders() {
  setModelProviderInfo("Loading provider catalog...");

  try {
    const result = await AdminAPI.get("/ai/model/providers");
    const providers = result.providers || [];

    setText("modelProviderCount", providers.length);
    const openaiProvider = providers.find((p) => p.provider === "openai") || {};
    setText("providerLiveModeStatus", providers.some((p) => p.live_mode_enabled) ? "ON" : "OFF");
    setText("openAiLiveGateStatus", openaiProvider.live_call_allowed ? "READY" : "BLOCKED");
    setText("openAiApiKeyStatus", openaiProvider.api_key_configured ? "CONFIGURED" : "MISSING");
    const geminiProvider = providers.find((p) => p.provider === "google") || {};
    setText("geminiLiveGateStatus", geminiProvider.live_call_allowed ? "READY" : "BLOCKED");
    setText("geminiApiKeyStatus", geminiProvider.api_key_configured ? "CONFIGURED" : "MISSING");
    renderProviderCatalog(providers);
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`Provider catalog loaded. count=${providers.length}`);
  } catch (error) {
    setModelProviderInfo(`Provider catalog load failed: ${error.message}`);
    setText("modelProviderJsonOutput", `Error: ${error.message}`);
  }
}

async function loadNormalizedModelProfiles() {
  const includeInactive = document.getElementById("modelProfilesIncludeInactive")?.value || "true";
  setModelProviderInfo("Loading normalized model profiles...");

  try {
    const result = await AdminAPI.get(`/ai/model/profiles/normalized?include_inactive=${encodeURIComponent(includeInactive)}`);
    const profiles = result.profiles || [];

    setText("normalizedProfileCount", profiles.length);
    renderNormalizedProfiles(profiles);
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`Normalized profiles loaded. count=${profiles.length}`);
  } catch (error) {
    setModelProviderInfo(`Normalized profiles load failed: ${error.message}`);
    setText("modelProviderJsonOutput", `Error: ${error.message}`);
  }
}

async function runProviderAdapterTest() {
  const provider = document.getElementById("providerTestProvider")?.value || "mock";
  const model_name = document.getElementById("providerTestModelName")?.value || "";
  const prompt = document.getElementById("providerTestPrompt")?.value || "Phase 11-1 provider test.";
  const live = (document.getElementById("providerTestLive")?.value || "false") === "true";

  setModelProviderInfo("Running provider adapter test...");

  try {
    const result = await AdminAPI.post("/ai/model/provider/test", {
      provider,
      model_name,
      prompt,
      live
    });

    setText("providerAdapterStatus", result.adapter_status || "-");
    setText("providerLiveModeStatus", result.live_mode_enabled ? "ON" : "OFF");
    setText("providerTestOutput", JSON.stringify(result.response || result, null, 2));
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`Provider test completed. status=${result.adapter_status || "-"}`);
  } catch (error) {
    setModelProviderInfo(`Provider test failed: ${error.message}`);
    setText("providerTestOutput", `Error: ${error.message}`);
  }
}

function renderOpenAiLiveStatus(result) {
  const cfg = result?.live_config || {};
  setText("openAiLiveGateStatus", cfg.live_call_allowed ? "READY" : "BLOCKED");
  setText("openAiApiKeyStatus", cfg.api_key_configured ? "CONFIGURED" : "MISSING");
  setText("openAiEnvAiLiveMode", cfg.live_mode_enabled ? "ON" : "OFF");
  setText("openAiEnvLiveEnabled", cfg.openai_live_enabled ? "ON" : "OFF");
  setText("openAiMaxPromptChars", cfg.max_prompt_chars ?? "-");
  setText("openAiTimeoutMs", cfg.timeout_ms ? `${cfg.timeout_ms} ms` : "-");
  setText("openAiLiveStatusOutput", JSON.stringify(result, null, 2));
}

async function loadOpenAiLiveStatus() {
  setModelProviderInfo("Loading OpenAI live safety status...");

  try {
    const result = await AdminAPI.get("/ai/model/openai/live-status");
    renderOpenAiLiveStatus(result);
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`OpenAI live status loaded. status=${result.status || "-"}`);
  } catch (error) {
    setModelProviderInfo(`OpenAI live status failed: ${error.message}`);
    setText("openAiLiveStatusOutput", `Error: ${error.message}`);
  }
}

async function loadOpenAiAvailableModels() {
  setModelProviderInfo("Loading OpenAI available models...");

  try {
    const result = await AdminAPI.get("/ai/model/openai/available-models?limit=100");
    setText("openAiAvailableModelsOutput", JSON.stringify(result, null, 2));
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`OpenAI available models loaded. count=${result.count || 0}`);

    const firstRecommended = (result.models || []).find((m) => /^(gpt-|o\d|o\d-)/.test(m.id));
    if (firstRecommended && document.getElementById("providerTestModelName")) {
      document.getElementById("providerTestModelName").value = firstRecommended.id;
    }
  } catch (error) {
    setModelProviderInfo(`OpenAI available models load failed: ${error.message}`);
    setText("openAiAvailableModelsOutput", `Error: ${error.message}`);
  }
}

async function runOpenAiLiveTest() {
  const model_name = document.getElementById("providerTestModelName")?.value || "";
  const prompt = document.getElementById("providerTestPrompt")?.value || "Phase 11-2 OpenAI live provider test.";
  const live = (document.getElementById("openAiLiveTestMode")?.value || "false") === "true";

  setModelProviderInfo(live ? "Running guarded OpenAI LIVE test..." : "Running OpenAI safety dry run...");

  try {
    const result = await AdminAPI.post("/ai/model/openai/live-test", {
      model_name,
      prompt,
      live
    });

    setText("providerAdapterStatus", result.adapter_status || "-");
    setText("providerLiveModeStatus", result.live_mode_enabled ? "ON" : "OFF");
    renderOpenAiLiveStatus({
      ok: result.ok,
      phase: result.phase,
      provider: result.provider,
      status: result.adapter_status,
      live_config: result.safety?.live_config || {},
      safety: result.safety,
      response: result.response
    });
    setText("providerTestOutput", JSON.stringify(result.response || result, null, 2));
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`OpenAI live test completed. status=${result.adapter_status || "-"}`);
  } catch (error) {
    setModelProviderInfo(`OpenAI live test failed: ${error.message}`);
    setText("providerTestOutput", `Error: ${error.message}`);
    setText("modelProviderJsonOutput", `Error: ${error.message}`);
  }
}


function renderAnthropicLiveStatus(result) {
  const cfg = result?.live_config || {};
  setText("anthropicLiveGateStatus", cfg.live_call_allowed ? "READY" : "BLOCKED");
  setText("anthropicApiKeyStatus", cfg.api_key_configured ? "CONFIGURED" : "MISSING");
  setText("anthropicEnvAiLiveMode", cfg.live_mode_enabled ? "ON" : "OFF");
  setText("anthropicEnvLiveEnabled", cfg.anthropic_live_enabled ? "ON" : "OFF");
  setText("anthropicMaxPromptChars", cfg.max_prompt_chars ?? "-");
  setText("anthropicTimeoutMs", cfg.timeout_ms ? `${cfg.timeout_ms} ms` : "-");
  setText("anthropicLiveStatusOutput", JSON.stringify(result, null, 2));
}

async function loadAnthropicLiveStatus() {
  setModelProviderInfo("Loading Anthropic live safety status...");

  try {
    const result = await AdminAPI.get("/ai/model/anthropic/live-status");
    renderAnthropicLiveStatus(result);
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`Anthropic live status loaded. status=${result.status || "-"}`);
  } catch (error) {
    setModelProviderInfo(`Anthropic live status failed: ${error.message}`);
    setText("anthropicLiveStatusOutput", `Error: ${error.message}`);
  }
}

async function loadAnthropicAvailableModels() {
  setModelProviderInfo("Loading Anthropic available models...");

  try {
    const result = await AdminAPI.get("/ai/model/anthropic/available-models?limit=100");
    setText("anthropicAvailableModelsOutput", JSON.stringify(result, null, 2));
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`Anthropic available models loaded. count=${result.count || 0}`);

    const firstRecommended = (result.models || []).find((m) => /claude/i.test(m.id));
    if (firstRecommended && document.getElementById("providerTestModelName")) {
      document.getElementById("providerTestModelName").value = firstRecommended.id;
      const providerSelect = document.getElementById("providerTestProvider");
      if (providerSelect) providerSelect.value = "anthropic";
    }
  } catch (error) {
    setModelProviderInfo(`Anthropic available models load failed: ${error.message}`);
    setText("anthropicAvailableModelsOutput", `Error: ${error.message}`);
  }
}

async function runAnthropicLiveTest() {
  const model_name = document.getElementById("providerTestModelName")?.value || "";
  const prompt = document.getElementById("providerTestPrompt")?.value || "Phase 11-3 Anthropic live provider test.";
  const live = (document.getElementById("anthropicLiveTestMode")?.value || "false") === "true";

  setModelProviderInfo(live ? "Running guarded Anthropic LIVE test..." : "Running Anthropic safety dry run...");

  try {
    const result = await AdminAPI.post("/ai/model/anthropic/live-test", {
      model_name,
      prompt,
      live
    });

    setText("providerAdapterStatus", result.adapter_status || "-");
    setText("providerLiveModeStatus", result.live_mode_enabled ? "ON" : "OFF");
    renderAnthropicLiveStatus({
      ok: result.ok,
      phase: result.phase,
      provider: result.provider,
      status: result.adapter_status,
      live_config: result.safety?.live_config || {},
      safety: result.safety,
      response: result.response
    });
    setText("providerTestOutput", JSON.stringify(result.response || result, null, 2));
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`Anthropic live test completed. status=${result.adapter_status || "-"}`);
  } catch (error) {
    setModelProviderInfo(`Anthropic live test failed: ${error.message}`);
    setText("providerTestOutput", `Error: ${error.message}`);
    setText("modelProviderJsonOutput", `Error: ${error.message}`);
  }
}


function renderGeminiLiveStatus(result) {
  const cfg = result?.live_config || {};
  setText("geminiLiveGateStatus", cfg.live_call_allowed ? "READY" : "BLOCKED");
  setText("geminiApiKeyStatus", cfg.api_key_configured ? "CONFIGURED" : "MISSING");
  setText("geminiEnvAiLiveMode", cfg.live_mode_enabled ? "ON" : "OFF");
  setText("geminiEnvLiveEnabled", cfg.gemini_live_enabled ? "ON" : "OFF");
  setText("geminiMaxPromptChars", cfg.max_prompt_chars ?? "-");
  setText("geminiTimeoutMs", cfg.timeout_ms ? `${cfg.timeout_ms} ms` : "-");
  setText("geminiLiveStatusOutput", JSON.stringify(result, null, 2));
}

async function loadGeminiLiveStatus() {
  setModelProviderInfo("Loading Gemini live safety status...");

  try {
    const result = await AdminAPI.get("/ai/model/gemini/live-status");
    renderGeminiLiveStatus(result);
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`Gemini live status loaded. status=${result.status || "-"}`);
  } catch (error) {
    setModelProviderInfo(`Gemini live status failed: ${error.message}`);
    setText("geminiLiveStatusOutput", `Error: ${error.message}`);
  }
}

async function loadGeminiAvailableModels() {
  setModelProviderInfo("Loading Gemini available models...");

  try {
    const result = await AdminAPI.get("/ai/model/gemini/available-models?limit=100");
    setText("geminiAvailableModelsOutput", JSON.stringify(result, null, 2));
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`Gemini available models loaded. count=${result.count || 0}`);

    const firstRecommended = (result.models || []).find((m) => /gemini/i.test(m.id));
    if (firstRecommended && document.getElementById("providerTestModelName")) {
      document.getElementById("providerTestModelName").value = firstRecommended.id;
      const providerSelect = document.getElementById("providerTestProvider");
      if (providerSelect) providerSelect.value = "google";
    }
  } catch (error) {
    setModelProviderInfo(`Gemini available models load failed: ${error.message}`);
    setText("geminiAvailableModelsOutput", `Error: ${error.message}`);
  }
}

async function runGeminiLiveTest() {
  const model_name = document.getElementById("providerTestModelName")?.value || "";
  const prompt = document.getElementById("providerTestPrompt")?.value || "Phase 11-4 Gemini live provider test.";
  const live = (document.getElementById("geminiLiveTestMode")?.value || "false") === "true";

  setModelProviderInfo(live ? "Running guarded Gemini LIVE test..." : "Running Gemini safety dry run...");

  try {
    const result = await AdminAPI.post("/ai/model/gemini/live-test", {
      model_name,
      prompt,
      live
    });

    setText("providerAdapterStatus", result.adapter_status || "-");
    setText("providerLiveModeStatus", result.live_mode_enabled ? "ON" : "OFF");
    renderGeminiLiveStatus({
      ok: result.ok,
      phase: result.phase,
      provider: result.provider,
      status: result.adapter_status,
      live_config: result.safety?.live_config || {},
      safety: result.safety,
      response: result.response
    });
    setText("providerTestOutput", JSON.stringify(result.response || result, null, 2));
    setText("modelProviderJsonOutput", JSON.stringify(result, null, 2));
    setModelProviderInfo(`Gemini live test completed. status=${result.adapter_status || "-"}`);
  } catch (error) {
    setModelProviderInfo(`Gemini live test failed: ${error.message}`);
    setText("providerTestOutput", `Error: ${error.message}`);
    setText("modelProviderJsonOutput", `Error: ${error.message}`);
  }
}



function setProviderRouterInfo(message) {
  setText("providerRouterResultInfo", message || "-");
}

function readProviderRouterPayload() {
  const requireLiveValue = document.getElementById("providerRouterRequireLive")?.value || "auto";
  const payload = {
    intent: document.getElementById("providerRouterIntent")?.value || "general",
    preferred_provider: document.getElementById("providerRouterPreferredProvider")?.value || "",
    force_provider: document.getElementById("providerRouterForceProvider")?.value || "",
    model_name: document.getElementById("providerRouterModelName")?.value || "",
    prompt: document.getElementById("providerRouterPrompt")?.value || "Phase 11-5 provider router test.",
    live: (document.getElementById("providerRouterLive")?.value || "false") === "true",
    allow_fallback: (document.getElementById("providerRouterAllowFallback")?.value || "true") === "true",
    execute_test: (document.getElementById("providerRouterExecuteTest")?.value || "false") === "true"
  };

  if (requireLiveValue !== "auto") {
    payload.require_live = requireLiveValue === "true";
  }

  return payload;
}

function renderProviderRouterCandidates(candidates) {
  const tbody = document.getElementById("providerRouterCandidatesBody");
  if (!tbody) return;

  if (!candidates || !candidates.length) {
    tbody.innerHTML = '<tr><td colspan="6">No router candidates loaded.</td></tr>';
    return;
  }

  tbody.innerHTML = candidates.map((candidate) => `
    <tr>
      <td>${escapeHtml(candidate.provider || "-")}</td>
      <td>${escapeHtml(candidate.model_name || "-")}</td>
      <td>${escapeHtml(candidate.status || "-")}</td>
      <td>${candidate.live_ready ? "YES" : "NO"}</td>
      <td>${candidate.selectable ? "YES" : "NO"}</td>
      <td>${escapeHtml(candidate.reason || "-")}</td>
    </tr>
  `).join("");
}

function renderProviderRouterResult(result) {
  const route = result.route || result;
  setText("providerRouterStatus", route.route_status || result.router_test_status || result.status || "-");
  setText("providerRouterSelectedProvider", route.selected_provider || "-");
  setText("providerRouterSelectedModel", route.selected_model || "-");
  setText("providerRouterLiveRequired", route.live_required ? "YES" : "NO");
  setText("providerRouterFallbackCount", Array.isArray(route.fallback_chain) ? route.fallback_chain.length : "-");
  setText("providerRouterWarningCount", Array.isArray(route.warnings) ? route.warnings.length : "0");
  renderProviderRouterCandidates(route.candidates || result.providers || []);
  setText("providerRouterTraceOutput", JSON.stringify(route.routing_trace || route.warnings || [], null, 2));
  setText("providerRouterJsonOutput", JSON.stringify(result, null, 2));
}

async function loadProviderRouterStatus() {
  setProviderRouterInfo("Loading provider router status...");
  try {
    const result = await AdminAPI.get("/ai/model/router/status");
    setText("providerRouterStatus", result.status || "-");
    setText("providerRouterSelectedProvider", result.config?.default_provider || "-");
    setText("providerRouterSelectedModel", "-");
    setText("providerRouterLiveRequired", result.config?.live_required_by_default ? "YES" : "NO");
    setText("providerRouterFallbackCount", result.config?.fallback_enabled ? "ON" : "OFF");
    setText("providerRouterWarningCount", Array.isArray(result.warnings) ? result.warnings.length : "0");
    renderProviderRouterCandidates(result.providers || []);
    setText("providerRouterTraceOutput", JSON.stringify(result.warnings || [], null, 2));
    setText("providerRouterJsonOutput", JSON.stringify(result, null, 2));
    setProviderRouterInfo(`Provider router status loaded. status=${result.status || "-"}`);
  } catch (error) {
    setProviderRouterInfo(`Provider router status failed: ${error.message}`);
    setText("providerRouterJsonOutput", `Error: ${error.message}`);
  }
}

async function loadProviderRouterRules() {
  setProviderRouterInfo("Loading provider routing rules...");
  try {
    const result = await AdminAPI.get("/ai/model/router/rules");
    setText("providerRouterRulesOutput", JSON.stringify(result, null, 2));
    setText("providerRouterJsonOutput", JSON.stringify(result, null, 2));
    setProviderRouterInfo(`Routing rules loaded. count=${(result.rules || []).length}`);
  } catch (error) {
    setProviderRouterInfo(`Routing rules load failed: ${error.message}`);
    setText("providerRouterRulesOutput", `Error: ${error.message}`);
  }
}

async function selectProviderRouteFromAdmin() {
  setProviderRouterInfo("Selecting provider route...");
  try {
    const payload = readProviderRouterPayload();
    const result = await AdminAPI.post("/ai/model/router/select", payload);
    renderProviderRouterResult(result);
    setProviderRouterInfo(`Provider route selected. provider=${result.selected_provider || "-"}, model=${result.selected_model || "-"}`);
  } catch (error) {
    setProviderRouterInfo(`Provider route selection failed: ${error.message}`);
    setText("providerRouterJsonOutput", `Error: ${error.message}`);
  }
}

async function testProviderRouteFromAdmin() {
  setProviderRouterInfo("Testing provider route...");
  try {
    const payload = readProviderRouterPayload();
    const result = await AdminAPI.post("/ai/model/router/test", payload);
    renderProviderRouterResult(result);
    setProviderRouterInfo(`Provider router test completed. status=${result.router_test_status || "-"}`);
  } catch (error) {
    setProviderRouterInfo(`Provider router test failed: ${error.message}`);
    setText("providerRouterJsonOutput", `Error: ${error.message}`);
  }
}

function clearProviderRouter() {
  setProviderRouterInfo("Provider router output cleared.");
  setText("providerRouterStatus", "-");
  setText("providerRouterSelectedProvider", "-");
  setText("providerRouterSelectedModel", "-");
  setText("providerRouterLiveRequired", "-");
  setText("providerRouterFallbackCount", "-");
  setText("providerRouterWarningCount", "-");
  renderProviderRouterCandidates([]);
  setText("providerRouterTraceOutput", "No routing trace loaded.");
  setText("providerRouterRulesOutput", "No routing rules loaded.");
  setText("providerRouterJsonOutput", "No provider router result loaded.");
}


function setProviderFallbackInfo(message) {
  setText("providerFallbackResultInfo", message || "-");
}

function readFallbackPayload() {
  const blockedRaw = document.getElementById("fallbackBlockedProviders")?.value || "";
  const blocked = blockedRaw.split(",").map((item) => item.trim()).filter(Boolean);
  return {
    intent: document.getElementById("fallbackIntent")?.value || "general",
    preferred_provider: document.getElementById("fallbackPreferredProvider")?.value || "openai",
    blocked_providers: blocked,
    prompt: document.getElementById("fallbackPrompt")?.value || "Phase 11-7 provider fallback test.",
    live: (document.getElementById("fallbackLive")?.value || "false") === "true",
    allow_fallback: (document.getElementById("fallbackAllowFallback")?.value || "true") === "true",
    execute_test: (document.getElementById("fallbackExecuteTest")?.value || "false") === "true"
  };
}

function renderFallbackMatrix(results) {
  const tbody = document.getElementById("fallbackMatrixBody");
  if (!tbody) return;
  if (!Array.isArray(results) || results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">No fallback matrix loaded.</td></tr>';
    return;
  }
  tbody.innerHTML = results.map((row) => `
    <tr>
      <td>${row.scenario_key || row.title || "-"}</td>
      <td>${row.passed ? "YES" : "NO"}</td>
      <td>${row.selected_provider || "-"}</td>
      <td>${row.route_status || "-"}</td>
      <td>${Array.isArray(row.blocked_providers) ? row.blocked_providers.join(", ") : "-"}</td>
    </tr>
  `).join("");
}

function renderFallbackResult(result) {
  const route = result.route || result;
  const matrix = result.fallback_matrix || result;
  setText("fallbackStatus", route.route_status || result.fallback_test_status || result.matrix_status || result.final_prep_status || "-");
  setText("fallbackSelectedProvider", route.selected_provider || "-");
  setText("fallbackSelectedModel", route.selected_model || "-");
  setText("fallbackMatrixPassed", matrix.passed_count ?? "-");
  setText("fallbackMatrixFailed", matrix.failed_count ?? "-");
  setText("phase11PrepStatus", result.final_prep_status || "-");
  renderFallbackMatrix(matrix.results || result.fallback_matrix?.results || []);
  setText("fallbackTraceOutput", JSON.stringify(route.routing_trace || result.results || [], null, 2));
  setText("providerFallbackJsonOutput", JSON.stringify(result, null, 2));
}

async function loadFallbackScenarios() {
  setProviderFallbackInfo("Loading fallback scenarios...");
  try {
    const result = await AdminAPI.get("/ai/model/router/fallback-scenarios");
    renderFallbackMatrix((result.scenarios || []).map((scenario) => ({
      scenario_key: scenario.key,
      title: scenario.title,
      passed: "scenario",
      selected_provider: "-",
      route_status: "definition",
      blocked_providers: scenario.blocked_providers || []
    })));
    setText("fallbackTraceOutput", JSON.stringify(result.scenarios || [], null, 2));
    setText("providerFallbackJsonOutput", JSON.stringify(result, null, 2));
    setProviderFallbackInfo(`Fallback scenarios loaded. count=${(result.scenarios || []).length}`);
  } catch (error) {
    setProviderFallbackInfo(`Fallback scenarios load failed: ${error.message}`);
    setText("providerFallbackJsonOutput", `Error: ${error.message}`);
  }
}

async function runFallbackTest() {
  setProviderFallbackInfo("Running fallback test...");
  try {
    const result = await AdminAPI.post("/ai/model/router/fallback-test", readFallbackPayload());
    renderFallbackResult(result);
    setProviderFallbackInfo(`Fallback test completed. status=${result.fallback_test_status || result.route?.route_status || "-"}`);
  } catch (error) {
    setProviderFallbackInfo(`Fallback test failed: ${error.message}`);
    setText("providerFallbackJsonOutput", `Error: ${error.message}`);
  }
}

async function runFallbackMatrix() {
  setProviderFallbackInfo("Running fallback matrix...");
  try {
    const executeTest = (document.getElementById("fallbackExecuteTest")?.value || "false") === "true";
    const live = (document.getElementById("fallbackLive")?.value || "false") === "true";
    const result = await AdminAPI.post("/ai/model/router/fallback-matrix", { execute_test: executeTest, live });
    renderFallbackResult(result);
    setProviderFallbackInfo(`Fallback matrix completed. passed=${result.passed_count}, failed=${result.failed_count}`);
  } catch (error) {
    setProviderFallbackInfo(`Fallback matrix failed: ${error.message}`);
    setText("providerFallbackJsonOutput", `Error: ${error.message}`);
  }
}

async function loadPhase11FinalPrep() {
  setProviderFallbackInfo("Loading Phase 11 final preparation...");
  try {
    const result = await AdminAPI.post("/ai/system/phase11-final-prep", {
      run_fallback_matrix: true,
      execute_test: false
    });
    renderFallbackResult(result);
    setText("phase11FinalPrepOutput", JSON.stringify(result, null, 2));
    setProviderFallbackInfo(`Phase 11 final preparation loaded. status=${result.final_prep_status || "-"}`);
  } catch (error) {
    setProviderFallbackInfo(`Phase 11 final preparation failed: ${error.message}`);
    setText("phase11FinalPrepOutput", `Error: ${error.message}`);
  }
}

function clearProviderFallback() {
  setProviderFallbackInfo("Fallback output cleared.");
  setText("fallbackStatus", "-");
  setText("fallbackSelectedProvider", "-");
  setText("fallbackSelectedModel", "-");
  setText("fallbackMatrixPassed", "-");
  setText("fallbackMatrixFailed", "-");
  setText("phase11PrepStatus", "-");
  renderFallbackMatrix([]);
  setText("fallbackTraceOutput", "No fallback trace loaded.");
  setText("phase11FinalPrepOutput", "No Phase 11 final preparation data loaded.");
  setText("providerFallbackJsonOutput", "No fallback result loaded.");
}

function setPhase11FinalInfo(message) {
  setText("phase11FinalResultInfo", message || "-");
}

function readPhase11FinalPayload() {
  return {
    project_code: document.getElementById("phase11FinalProjectCode")?.value || "rbs_ai_memory",
    session_id: document.getElementById("phase11FinalSessionId")?.value || "phase-11-final-smoke-test",
    user_id: "admin-final-check",
    question: document.getElementById("phase11FinalQuestion")?.value || "Phase 11 Final routed multi-provider response smoke test.",
    run_response_smoke_test: (document.getElementById("phase11FinalRunSmoke")?.value || "false") === "true",
    save_smoke_test_to_memory: (document.getElementById("phase11FinalSaveSmoke")?.value || "false") === "true",
    execute_fallback_matrix: (document.getElementById("phase11FinalExecuteMatrix")?.value || "false") === "true",
    live: (document.getElementById("phase11FinalLive")?.value || "false") === "true",
    preferred_provider: document.getElementById("phase11FinalPreferredProvider")?.value || "mock",
    intent: document.getElementById("phase11FinalIntent")?.value || "reasoning"
  };
}

function renderPhase11FinalDecision(result) {
  setText("phase11FinalDecisionStatus", result.decision_status || "-");
  setText("phase11FinalPhase12Entry", result.phase12_entry_allowed ? "ALLOWED" : "BLOCKED");
  setText("phase11FinalScore", result.score ?? "-");
  setText("phase11FinalLiveReadyCount", result.summary?.live_ready_provider_count ?? "-");
  setText("phase11FinalFallbackStatus", result.summary?.fallback_matrix_status || "-");
  setText("phase11FinalSmokeStatus", result.summary?.smoke_test_status || "-");
  setText("phase11FinalCompletedOutput", Array.isArray(result.completed_items) && result.completed_items.length ? result.completed_items.join("\n") : "No completed items reported.");
  const warningLines = [
    "Warnings:",
    ...(Array.isArray(result.warnings) && result.warnings.length ? result.warnings : ["No warnings"]),
    "",
    "Errors:",
    ...(Array.isArray(result.errors) && result.errors.length ? result.errors : ["No errors"])
  ];
  setText("phase11FinalWarningsOutput", warningLines.join("\n"));
  setText("phase11FinalJsonOutput", JSON.stringify(result, null, 2));
}

async function loadPhase11CompletionChecklist() {
  setPhase11FinalInfo("Loading Phase 11 completion checklist...");
  try {
    const result = await AdminAPI.get("/ai/system/phase11-completion-checklist");
    setText("phase11CompletionChecklistOutput", JSON.stringify(result, null, 2));
    setPhase11FinalInfo(`Completion checklist loaded. count=${(result.checklist || []).length}`);
  } catch (error) {
    setPhase11FinalInfo(`Completion checklist load failed: ${error.message}`);
    setText("phase11CompletionChecklistOutput", `Error: ${error.message}`);
  }
}

async function runPhase11FinalDecision() {
  setPhase11FinalInfo("Running Phase 11 Final Decision...");
  try {
    const result = await AdminAPI.post("/ai/system/phase11-final-decision", readPhase11FinalPayload());
    renderPhase11FinalDecision(result);
    setPhase11FinalInfo(`Phase 11 Final completed. status=${result.decision_status || "-"}, phase12_entry_allowed=${result.phase12_entry_allowed ? "true" : "false"}`);
  } catch (error) {
    setPhase11FinalInfo(`Phase 11 Final failed: ${error.message}`);
    setText("phase11FinalJsonOutput", `Error: ${error.message}`);
  }
}

function clearPhase11FinalDecision() {
  setPhase11FinalInfo("Phase 11 Final output cleared.");
  setText("phase11FinalDecisionStatus", "-");
  setText("phase11FinalPhase12Entry", "-");
  setText("phase11FinalScore", "-");
  setText("phase11FinalLiveReadyCount", "-");
  setText("phase11FinalFallbackStatus", "-");
  setText("phase11FinalSmokeStatus", "-");
  setText("phase11FinalCompletedOutput", "No completed items loaded.");
  setText("phase11FinalWarningsOutput", "No warnings or errors loaded.");
  setText("phase11CompletionChecklistOutput", "No checklist loaded.");
  setText("phase11FinalJsonOutput", "No Phase 11 Final decision loaded.");
}



// ======================================================
// Phase 12-2: Admin Role-based Permissions
// ======================================================
function renderAdminPermissionRoles(roles) {
  const tbody = document.getElementById("adminPermissionRolesTableBody");
  if (!tbody) return;

  if (!Array.isArray(roles) || !roles.length) {
    tbody.innerHTML = '<tr><td colspan="4">No roles found.</td></tr>';
    return;
  }

  tbody.innerHTML = roles.map((role) => `
    <tr>
      <td><strong>${role.role || ""}</strong></td>
      <td>${role.label || ""}</td>
      <td class="wrap-cell">${role.description || ""}</td>
      <td class="wrap-cell"><code>${Array.isArray(role.permissions) ? role.permissions.join(", ") : ""}</code></td>
    </tr>
  `).join("");
}

function renderAdminPermissionEvents(rows) {
  const tbody = document.getElementById("adminPermissionEventsTableBody");
  if (!tbody) return;

  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="7">No permission events found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.id ?? ""}</td>
      <td>${formatDate(row.event_time || row.created_at)}</td>
      <td>${statusBadge(row.outcome || "")}</td>
      <td>${row.role_name || ""}</td>
      <td><code>${row.permission_key || ""}</code></td>
      <td>${row.token_label || "-"}</td>
      <td class="wrap-cell">${row.path || ""}</td>
    </tr>
  `).join("");
}

async function loadAdminPermissionStatus() {
  try {
    setText("adminPermissionResultInfo", "Loading admin permission status...");
    const data = await AdminAPI.get("/ai/security/admin/permissions/status");

    setText("adminPermissionStatus", data.status || "UNKNOWN", data.status === "GOOD" ? "status-good-text" : data.status === "WARNING" ? "status-warning-text" : "status-error-text");
    setText("adminCurrentRole", data.actor?.role || "-");
    setText("adminPermissionTokenLabel", data.actor?.token_label || "-");
    setText("adminRoleCount", data.role_count ?? "-");
    setText("adminPermissionCount", data.permission_count ?? "-");
    setText("adminPermissionEnforcementMode", data.enforcement_mode || "-");
    setText("adminRoleAssignmentsOutput", JSON.stringify(data.role_assignments || {}, null, 2));
    setText("adminPermissionFullJson", JSON.stringify(data, null, 2));
    setText("adminPermissionResultInfo", `Permission status loaded. Current role: ${data.actor?.role || "UNKNOWN"}`);
    return data;
  } catch (error) {
    console.error("Admin permission status load error:", error);
    setText("adminPermissionResultInfo", `Permission status load failed: ${error.message}`, "result-info error-text");
    setText("adminPermissionFullJson", error.message || "Unknown error");
    return null;
  }
}

async function loadAdminPermissionRoles() {
  try {
    setText("adminPermissionResultInfo", "Loading admin role matrix...");
    const data = await AdminAPI.get("/ai/security/admin/permissions/roles");
    renderAdminPermissionRoles(data.roles || []);
    setText("adminPermissionFullJson", JSON.stringify(data, null, 2));
    setText("adminPermissionResultInfo", `Role matrix loaded. Roles: ${data.total_roles ?? 0}, permissions: ${data.total_permissions ?? 0}`);
    return data;
  } catch (error) {
    console.error("Admin permission roles load error:", error);
    setText("adminPermissionResultInfo", `Role matrix load failed: ${error.message}`, "result-info error-text");
    renderAdminPermissionRoles([]);
    return null;
  }
}

async function loadAdminPermissionPolicies() {
  try {
    setText("adminPermissionResultInfo", "Loading admin permission policies...");
    const data = await AdminAPI.get("/ai/security/admin/permissions/policies");
    setText("adminPermissionPoliciesOutput", JSON.stringify(data, null, 2));
    setText("adminPermissionFullJson", JSON.stringify(data, null, 2));
    setText("adminPermissionResultInfo", `Permission policies loaded. Count: ${Array.isArray(data.policies) ? data.policies.length : 0}`);
    return data;
  } catch (error) {
    console.error("Admin permission policies load error:", error);
    setText("adminPermissionResultInfo", `Permission policies load failed: ${error.message}`, "result-info error-text");
    return null;
  }
}

async function runAdminPermissionCheck() {
  try {
    const role = getValue("adminPermissionCheckRole", "viewer");
    const permission = getValue("adminPermissionCheckKey", "dashboard:read");

    setText("adminPermissionResultInfo", `Checking permission ${permission} for role ${role}...`);
    const data = await AdminAPI.post("/ai/security/admin/permissions/check", { role, permission });
    setText("adminPermissionCheckOutput", JSON.stringify(data, null, 2));
    setText("adminPermissionFullJson", JSON.stringify(data, null, 2));
    setText("adminPermissionResultInfo", `Permission check completed. Allowed: ${data.allowed ? "YES" : "NO"}`);
    return data;
  } catch (error) {
    console.error("Admin permission check error:", error);
    setText("adminPermissionResultInfo", `Permission check failed: ${error.message}`, "result-info error-text");
    setText("adminPermissionCheckOutput", error.message || "Unknown error");
    return null;
  }
}

async function loadAdminPermissionEvents() {
  try {
    setText("adminPermissionResultInfo", "Loading admin permission events...");
    const data = await AdminAPI.get("/ai/security/admin/permissions/events?limit=50");
    const rows = data.results || data.data || [];
    renderAdminPermissionEvents(rows);
    setText("adminPermissionResultInfo", `Permission events loaded. Count: ${data.count ?? rows.length}`);
    return data;
  } catch (error) {
    console.error("Admin permission events load error:", error);
    setText("adminPermissionResultInfo", `Permission events load failed: ${error.message}`, "result-info error-text");
    renderAdminPermissionEvents([]);
    return null;
  }
}

// ======================================================
// Phase 12-1: Admin Security + Token Rotation
// ======================================================
function renderAdminSecurityEvents(rows) {
  const tbody = document.getElementById("adminSecurityEventsTableBody");
  if (!tbody) return;

  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="8">No auth events found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.id ?? ""}</td>
      <td>${formatDate(row.event_time || row.created_at)}</td>
      <td>${row.event_type || ""}</td>
      <td>${statusBadge(row.outcome || "")}</td>
      <td>${row.reason || ""}</td>
      <td>${row.token_label || "-"}</td>
      <td>${row.token_source || "-"}</td>
      <td class="wrap-cell">${row.path || ""}</td>
    </tr>
  `).join("");
}

async function loadAdminSecurityStatus() {
  try {
    setText("adminSecurityResultInfo", "Loading admin security status...");
    const data = await AdminAPI.get("/ai/security/admin/status");

    setText("adminSecurityStatus", data.status || "UNKNOWN", data.status === "GOOD" ? "status-good-text" : data.status === "WARNING" ? "status-warning-text" : "status-error-text");
    setText("adminSecurityEnabled", data.admin_enabled ? "YES" : "NO");
    setText("adminPrimaryTokenStatus", data.primary_token_configured ? "CONFIGURED" : "MISSING");
    setText("adminSecondaryTokenStatus", data.secondary_token_configured ? "CONFIGURED" : "MISSING");
    setText("adminRotationReady", data.rotation_ready ? "YES" : "NO");
    setText("adminCurrentTokenLabel", data.current_request?.token_label || "-");

    setText("adminTokenFingerprintsOutput", JSON.stringify(data.token_fingerprints || [], null, 2));
    setText("adminSecurityWarningsOutput", JSON.stringify({ warnings: data.warnings || [], errors: data.errors || [] }, null, 2));
    setText("adminTokenRotationGuideOutput", Array.isArray(data.rotation_guide) ? data.rotation_guide.map((item, index) => `${index + 1}. ${item}`).join("\n") : "-");
    setText("adminSecurityFullJson", JSON.stringify(data, null, 2));

    setText("adminSecurityResultInfo", `Security status loaded. Status: ${data.status || "UNKNOWN"}`);
    return data;
  } catch (error) {
    console.error("Admin security status load error:", error);
    setText("adminSecurityResultInfo", `Security status load failed: ${error.message}`, "result-info error-text");
    setText("adminSecurityFullJson", error.message || "Unknown error");
    return null;
  }
}

async function loadAdminSecurityEvents() {
  try {
    setText("adminSecurityResultInfo", "Loading admin auth events...");
    const data = await AdminAPI.get("/ai/security/admin/events?limit=50");
    const rows = data.results || data.data || [];
    renderAdminSecurityEvents(rows);
    setText("adminSecurityResultInfo", `Admin auth events loaded. Count: ${data.count ?? rows.length}`);
    return data;
  } catch (error) {
    console.error("Admin security events load error:", error);
    setText("adminSecurityResultInfo", `Admin auth events load failed: ${error.message}`, "result-info error-text");
    renderAdminSecurityEvents([]);
    return null;
  }
}



// =====================================================
// Phase 12-3: Dangerous Actions UI
// =====================================================
function getDangerousActionPayload() {
  const actionKey = document.getElementById("dangerousActionKey")?.value?.trim() || "TEST_DANGEROUS_CONFIRMATION";
  const confirmAction = document.getElementById("dangerousConfirmAction")?.value?.trim() || actionKey;
  const confirmText = document.getElementById("dangerousConfirmText")?.value?.trim() || actionKey;

  return {
    action_key: actionKey,
    confirm_action: confirmAction,
    confirm_text: confirmText
  };
}

function syncDangerousConfirmInputs() {
  const actionKey = document.getElementById("dangerousActionKey")?.value?.trim() || "";
  const confirmAction = document.getElementById("dangerousConfirmAction");
  const confirmText = document.getElementById("dangerousConfirmText");
  if (confirmAction) confirmAction.value = actionKey;
  if (confirmText) confirmText.value = actionKey;
}

async function loadDangerousActionStatus() {
  try {
    const data = await AdminAPI.get("/ai/security/dangerous-actions/status");
    setText("dangerousEnforcementStatus", data?.status || "-");
    setText("dangerousConfirmationRequired", String(data?.config?.confirmation_required ?? "-"));
    setText("dangerousCurrentRole", data?.actor?.role || "-");
    setText("dangerousCatalogCount", data?.catalog_count ?? "-");
    setText("dangerousActionResultInfo", `Dangerous action status loaded at ${nowText()}`);
    const out = document.getElementById("dangerousFullJson");
    if (out) out.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    setText("dangerousActionResultInfo", `Dangerous status load failed: ${error.message}`);
  }
}

function renderDangerousCatalog(rows) {
  const body = document.getElementById("dangerousCatalogTableBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6">No dangerous action catalog loaded.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.action_key)}</strong><br><span class="muted-text">${escapeHtml(row.label || "")}</span></td>
      <td>${escapeHtml(row.group || "-")}</td>
      <td>${statusBadge(row.risk_level || "-")}</td>
      <td><code>${escapeHtml(row.permission || "-")}</code></td>
      <td><code>${escapeHtml(row.required_phrase || "-")}</code></td>
      <td>${escapeHtml(row.route_hint || "-")}</td>
    </tr>
  `).join("");
}

async function loadDangerousActionCatalog() {
  try {
    const data = await AdminAPI.get("/ai/security/dangerous-actions/catalog");
    const rows = extractRows(data);
    renderDangerousCatalog(rows);
    setText("dangerousCatalogCount", data?.count ?? rows.length);
    setText("dangerousActionResultInfo", `Dangerous action catalog loaded. Count: ${rows.length}`);
    const out = document.getElementById("dangerousFullJson");
    if (out) out.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    setText("dangerousActionResultInfo", `Dangerous catalog load failed: ${error.message}`);
  }
}

async function validateDangerousActionFromAdmin() {
  try {
    const payload = getDangerousActionPayload();
    const data = await AdminAPI.post("/ai/security/dangerous-actions/validate", payload);
    const out = document.getElementById("dangerousValidationOutput");
    if (out) out.textContent = JSON.stringify(data, null, 2);
    setText("dangerousActionResultInfo", data?.ok ? "Dangerous action confirmation is valid." : "Dangerous action confirmation is not valid.");
    await loadDangerousActionEvents();
  } catch (error) {
    const out = document.getElementById("dangerousValidationOutput");
    if (out) out.textContent = error.message;
    setText("dangerousActionResultInfo", `Dangerous validation failed: ${error.message}`);
  }
}

async function runDangerousConfirmationTest() {
  try {
    const payload = getDangerousActionPayload();
    payload.action_key = "TEST_DANGEROUS_CONFIRMATION";
    payload.confirm_action = "TEST_DANGEROUS_CONFIRMATION";
    payload.confirm_text = "TEST_DANGEROUS_CONFIRMATION";

    const data = await AdminAPI.post("/ai/security/dangerous-actions/test-confirmation", payload);
    const out = document.getElementById("dangerousValidationOutput");
    if (out) out.textContent = JSON.stringify(data, null, 2);
    setText("dangerousActionResultInfo", "Dangerous confirmation test passed.");
    await loadDangerousActionEvents();
  } catch (error) {
    const out = document.getElementById("dangerousValidationOutput");
    if (out) out.textContent = error.message;
    setText("dangerousActionResultInfo", `Dangerous confirmation test failed: ${error.message}`);
  }
}

function renderDangerousEvents(rows) {
  const body = document.getElementById("dangerousEventsTableBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7">No dangerous action events loaded.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.id)}</td>
      <td>${escapeHtml(formatDate(row.event_time || row.created_at))}</td>
      <td><code>${escapeHtml(row.action_key || "-")}</code></td>
      <td>${statusBadge(row.outcome || "-")}</td>
      <td>${escapeHtml(row.actor_role || "-")}</td>
      <td>${escapeHtml(row.reason || "-")}</td>
      <td>${escapeHtml(row.path || "-")}</td>
    </tr>
  `).join("");
}

async function loadDangerousActionEvents() {
  try {
    const data = await AdminAPI.get("/ai/security/dangerous-actions/events?limit=50");
    const rows = extractRows(data);
    renderDangerousEvents(rows);
    setText("dangerousActionResultInfo", `Dangerous action events loaded. Count: ${rows.length}`);
    const out = document.getElementById("dangerousFullJson");
    if (out) out.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    setText("dangerousActionResultInfo", `Dangerous events load failed: ${error.message}`);
  }
}



async function loadApiErrorStandardStatus() {
  try {
    const data = await AdminAPI.get("/ai/security/api-errors/status");
    setText("apiErrorStandardStatus", data.status || "ACTIVE");
    setText("apiErrorCatalogCount", "-");
    setText("apiErrorResultInfo", `API error standard status loaded at ${nowText()}.`);
    setText("apiErrorShapeOutput", JSON.stringify(data.response_shape || data, null, 2));
    setText("apiErrorTestOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Load API error standard status error:", error);
    setText("apiErrorResultInfo", `Failed to load API error standard status: ${error.message}`);
  }
}

async function loadApiErrorCatalog() {
  try {
    const data = await AdminAPI.get("/ai/security/api-errors/catalog");
    setText("apiErrorCatalogCount", data.count ?? data.error_catalog?.length ?? "-");
    setText("apiErrorResultInfo", `API error catalog loaded at ${nowText()}.`);
    setText("apiErrorCatalogOutput", JSON.stringify(data.error_catalog || data, null, 2));
    setText("apiErrorTestOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Load API error catalog error:", error);
    setText("apiErrorResultInfo", `Failed to load API error catalog: ${error.message}`);
  }
}

async function loadApiErrorExamples() {
  try {
    const data = await AdminAPI.get("/ai/security/api-errors/examples");
    setText("apiErrorResultInfo", `API error examples loaded at ${nowText()}.`);
    setText("apiErrorTestOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Load API error examples error:", error);
    setText("apiErrorResultInfo", `Failed to load API error examples: ${error.message}`);
  }
}

async function runApiErrorResponseTest() {
  try {
    const scenario = document.getElementById("apiErrorScenario")?.value || "validation";
    const data = await AdminAPI.post("/ai/security/api-errors/test", { scenario });
    setText("apiErrorLastCode", data.error?.code || "-");
    setText("apiErrorLastHttpStatus", data.error?.http_status ?? "-");
    setText("apiErrorResultInfo", `Standard error test completed for scenario: ${scenario}`);
    setText("apiErrorTestOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    // AdminAPI may throw for non-2xx responses. Phase 12-4 error-test deliberately returns
    // 4xx/5xx standard error payloads, so we still show the normalized error if available.
    console.error("Run API error response test error:", error);
    const normalized = error?.payload || error?.response || {
      ok: false,
      error: {
        code: "CLIENT_DISPLAY_ERROR",
        message: error.message
      }
    };
    setText("apiErrorLastCode", normalized.error?.code || "-");
    setText("apiErrorLastHttpStatus", normalized.error?.http_status ?? "-");
    setText("apiErrorResultInfo", "Standard error test returned an error response as expected.");
    setText("apiErrorTestOutput", JSON.stringify(normalized, null, 2));
  }
}



function renderEnvConfigGroups(groups) {
  const body = document.getElementById("envConfigGroupsTableBody");
  if (!body) return;

  if (!groups || !groups.length) {
    body.innerHTML = '<tr><td colspan="4">No environment validation groups loaded.</td></tr>';
    return;
  }

  body.innerHTML = groups.map((group) => `
    <tr>
      <td>${escapeHtml(group.title || group.group_key || "-")}</td>
      <td>${statusBadge(group.status || "-")}</td>
      <td>${escapeHtml((group.missing_required || []).join(", ") || "-")}</td>
      <td>${escapeHtml((group.missing_recommended || []).join(", ") || "-")}</td>
    </tr>
  `).join("");
}

async function loadEnvConfigStatus() {
  try {
    const data = await AdminAPI.get("/ai/security/env-config/status");
    setText("envConfigStatus", data.status || "-");
    setText("envConfigGoodGroups", data.summary?.good_groups ?? "-");
    setText("envConfigWarningGroups", data.summary?.warning_groups ?? "-");
    setText("envConfigErrorGroups", data.summary?.error_groups ?? "-");
    renderEnvConfigGroups(data.groups || []);
    setText("envConfigWarningsOutput", (data.warnings || []).length ? data.warnings.join("\n") : "No warnings");
    setText("envConfigErrorsOutput", (data.errors || []).length ? data.errors.join("\n") : "No errors");
    setText("envConfigFullJson", JSON.stringify(data, null, 2));
    setText("envConfigResultInfo", `Environment validation status loaded at ${nowText()}.`);
  } catch (error) {
    console.error("Load environment config status error:", error);
    setText("envConfigResultInfo", `Failed to load environment config status: ${error.message}`);
  }
}

async function loadEnvConfigChecklist() {
  try {
    const data = await AdminAPI.get("/ai/security/env-config/checklist");
    setText("envConfigChecklistOutput", JSON.stringify(data.checklist || data, null, 2));
    setText("envConfigResultInfo", `Environment checklist loaded at ${nowText()}.`);
    setText("envConfigFullJson", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Load environment config checklist error:", error);
    setText("envConfigResultInfo", `Failed to load environment config checklist: ${error.message}`);
  }
}

async function runEnvConfigValidationTest() {
  try {
    const scenario = document.getElementById("envConfigScenario")?.value || "current";
    const data = await AdminAPI.post("/ai/security/env-config/test", { scenario });
    setText("envConfigResultInfo", `Environment validation test completed for scenario: ${scenario}`);
    if (data.result) {
      setText("envConfigStatus", data.result.status || "-");
      setText("envConfigGoodGroups", data.result.summary?.good_groups ?? "-");
      setText("envConfigWarningGroups", data.result.summary?.warning_groups ?? "-");
      setText("envConfigErrorGroups", data.result.summary?.error_groups ?? "-");
      renderEnvConfigGroups(data.result.groups || []);
      setText("envConfigWarningsOutput", (data.result.warnings || []).length ? data.result.warnings.join("\n") : "No warnings");
      setText("envConfigErrorsOutput", (data.result.errors || []).length ? data.result.errors.join("\n") : "No errors");
    }
    setText("envConfigFullJson", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Run environment config validation test error:", error);
    setText("envConfigResultInfo", `Environment validation test failed: ${error.message}`);
  }
}


function renderDeploymentChecklist(items) {
  const body = document.getElementById("deploymentChecklistTableBody");
  if (!body) return;

  if (!items || !items.length) {
    body.innerHTML = '<tr><td colspan="5">No deployment checklist loaded.</td></tr>';
    return;
  }

  body.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.group || "-")}</td>
      <td class="wrap-cell">${escapeHtml(item.label || item.key || "-")}</td>
      <td>${item.required ? "Yes" : "No"}</td>
      <td>${statusBadge(item.status || "-")}</td>
      <td class="wrap-cell">${escapeHtml(item.detail || "-")}</td>
    </tr>
  `).join("");
}

function applyDeploymentSummary(data) {
  const summary = data.summary || {};
  setText("deploymentStatus", data.deployment_status || summary.deployment_status || "-");
  setText("deploymentEntryAllowed", data.production_entry_allowed ?? summary.production_entry_allowed ?? "-");
  setText("deploymentFailCount", summary.fail_count ?? "-");
  setText("deploymentManualCount", summary.manual_required_count ?? "-");
}

async function loadDeploymentStatus() {
  try {
    const data = await AdminAPI.get("/ai/security/deployment/status");
    applyDeploymentSummary(data);
    setText("deploymentBlockingOutput", JSON.stringify(data.blocking_items || [], null, 2));
    setText("deploymentManualOutput", JSON.stringify(data.manual_items || [], null, 2));
    setText("deploymentFullJson", JSON.stringify(data, null, 2));
    setText("deploymentResultInfo", `Deployment status loaded at ${nowText()}.`);
  } catch (error) {
    console.error("Load deployment status error:", error);
    setText("deploymentResultInfo", `Failed to load deployment status: ${error.message}`);
  }
}

async function loadDeploymentChecklist() {
  try {
    const data = await AdminAPI.get("/ai/security/deployment/checklist");
    applyDeploymentSummary(data);
    renderDeploymentChecklist(data.checklist || []);
    setText("deploymentFullJson", JSON.stringify(data, null, 2));
    setText("deploymentResultInfo", `Deployment checklist loaded at ${nowText()}.`);
  } catch (error) {
    console.error("Load deployment checklist error:", error);
    setText("deploymentResultInfo", `Failed to load deployment checklist: ${error.message}`);
  }
}

async function runDeploymentReadinessTest() {
  try {
    const scenario = document.getElementById("deploymentScenario")?.value || "current";
    const data = await AdminAPI.post("/ai/security/deployment/test", { scenario });
    setText("deploymentResultInfo", `Deployment readiness test completed for scenario: ${scenario}`);
    if (data.result) {
      applyDeploymentSummary(data.result);
      setText("deploymentBlockingOutput", JSON.stringify(data.result.blocking_items || [], null, 2));
      setText("deploymentManualOutput", JSON.stringify(data.result.manual_items || [], null, 2));
    }
    if (data.checklist) {
      renderDeploymentChecklist(data.checklist.checklist || data.checklist || []);
    }
    setText("deploymentFullJson", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Run deployment readiness test error:", error);
    setText("deploymentResultInfo", `Deployment readiness test failed: ${error.message}`);
  }
}


// ======================================================
// Phase 12-7: Admin Console Production Mode / Dev Mode
// ======================================================
const DEFAULT_DEVELOPER_MENU_HASHES = new Set([
  "context-build",
  "context-preview",
  "context-assembly",
  "ai-pipeline-draft",
  "phase10-final",
  "provider-router",
  "provider-fallback",
  "phase11-final",
  "admin-permissions",
  "dangerous-actions",
  "api-errors",
  "env-config",
  "deployment-checklist",
  "context-rebuild",
  "system"
]);

let latestAdminConsoleModeStatus = null;

function getUrlDevModeEnabled() {
  const params = new URLSearchParams(window.location.search);
  return params.get("dev") === "1" || params.get("mode") === "dev" || params.get("mode") === "development";
}

function getMenuHashFromAnchor(anchor) {
  const href = anchor.getAttribute("href") || "";
  if (!href.startsWith("#")) return "";
  return href.slice(1);
}

function applyAdminConsoleModeUi(status = latestAdminConsoleModeStatus) {
  if (!status) return;

  const urlDevMode = getUrlDevModeEnabled();
  const allowUrlDevMode = status.allow_url_dev_mode !== false;
  const urlDevOverrideActive = urlDevMode && allowUrlDevMode;
  const shouldHideDeveloperMenus = Boolean(status.developer_menus_hidden_by_default) && !urlDevOverrideActive;
  const developerHashes = new Set(status.menu_groups?.developer_diagnostic || Array.from(DEFAULT_DEVELOPER_MENU_HASHES));

  document.body.classList.toggle("console-production-mode", status.console_mode === "production");
  document.body.classList.toggle("console-development-mode", !shouldHideDeveloperMenus);
  document.body.classList.toggle("console-dev-override-active", urlDevOverrideActive);

  document.querySelectorAll(".nav-item").forEach((anchor) => {
    const hash = getMenuHashFromAnchor(anchor);
    const isDeveloperMenu = developerHashes.has(hash);
    anchor.classList.toggle("developer-menu-item", isDeveloperMenu);
    anchor.classList.toggle("developer-menu-hidden", isDeveloperMenu && shouldHideDeveloperMenus);
  });

  const badge = document.getElementById("adminConsoleModeBadge");
  if (badge) {
    const modeText = urlDevOverrideActive ? `${status.console_mode} + dev` : status.console_mode;
    badge.textContent = `Mode: ${modeText}`;
    badge.className = "mode-badge";
    if (status.status === "ERROR") badge.classList.add("mode-error");
    else if (status.status === "WARNING") badge.classList.add("mode-warning");
    else badge.classList.add("mode-good");
  }

  const currentHash = (window.location.hash || "#dashboard").slice(1);
  if (shouldHideDeveloperMenus && developerHashes.has(currentHash)) {
    window.location.hash = "#dashboard";
  }
}

function renderAdminConsoleModeChecklist(items) {
  const body = document.getElementById("adminConsoleModeChecklistBody");
  if (!body) return;

  if (!items || !items.length) {
    body.innerHTML = '<tr><td colspan="4">No console mode checklist loaded.</td></tr>';
    return;
  }

  body.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.group || "-")}</td>
      <td class="wrap-cell">${escapeHtml(item.label || item.key || "-")}</td>
      <td>${statusBadge(item.status || "-")}</td>
      <td class="wrap-cell">${escapeHtml(item.detail || "-")}</td>
    </tr>
  `).join("");
}

function applyAdminConsoleModeSummary(data) {
  setText("adminConsoleModeValue", data.console_mode || "-");
  setText("adminConsoleModeStatus", data.status || "-");
  setText("adminConsoleDevMenus", data.developer_menus_hidden_by_default ? "Hidden by default" : "Visible");
  setText("adminConsoleUrlDevMode", data.allow_url_dev_mode ? "Allowed" : "Disabled");
  setText("adminConsoleModeSummaryOutput", JSON.stringify({
    console_mode: data.console_mode,
    status: data.status,
    production_like: data.production_like,
    developer_menus_hidden_by_default: data.developer_menus_hidden_by_default,
    allow_url_dev_mode: data.allow_url_dev_mode,
    url_dev_override_active: getUrlDevModeEnabled() && data.allow_url_dev_mode !== false,
    operator_action: data.operator_action,
    warnings: data.warnings || [],
    errors: data.errors || []
  }, null, 2));
  setText("adminConsoleDevMenuOutput", JSON.stringify(data.menu_groups?.developer_diagnostic || [], null, 2));
  setText("adminConsoleModeFullJson", JSON.stringify(data, null, 2));
}

async function loadAdminConsoleModeStatus() {
  try {
    const data = await AdminAPI.get("/ai/security/admin-console/mode/status");
    latestAdminConsoleModeStatus = data;
    applyAdminConsoleModeSummary(data);
    applyAdminConsoleModeUi(data);
    setText("adminConsoleModeResultInfo", `Console mode status loaded at ${nowText()}.`);
  } catch (error) {
    console.error("Load admin console mode status error:", error);
    setText("adminConsoleModeResultInfo", `Failed to load console mode status: ${error.message}`);
  }
}

async function loadAdminConsoleModeChecklist() {
  try {
    const data = await AdminAPI.get("/ai/security/admin-console/mode/checklist");
    renderAdminConsoleModeChecklist(data.checklist || []);
    setText("adminConsoleModeFullJson", JSON.stringify(data, null, 2));
    setText("adminConsoleModeResultInfo", `Console mode checklist loaded at ${nowText()}.`);
  } catch (error) {
    console.error("Load admin console mode checklist error:", error);
    setText("adminConsoleModeResultInfo", `Failed to load console mode checklist: ${error.message}`);
  }
}

async function runAdminConsoleModeTest() {
  try {
    const scenario = document.getElementById("adminConsoleModeScenario")?.value || "current";
    const data = await AdminAPI.post("/ai/security/admin-console/mode/test", { scenario });
    if (data.result) {
      latestAdminConsoleModeStatus = data.result;
      applyAdminConsoleModeSummary(data.result);
      applyAdminConsoleModeUi(data.result);
    }
    setText("adminConsoleModeFullJson", JSON.stringify(data, null, 2));
    setText("adminConsoleModeResultInfo", `Console mode test completed for scenario: ${scenario}`);
  } catch (error) {
    console.error("Run admin console mode test error:", error);
    setText("adminConsoleModeResultInfo", `Console mode test failed: ${error.message}`);
  }
}



// ======================================================
// Phase 13-1: Database Backup Status
// ======================================================
// Phase 13-3A: small loading helper for backup buttons
function setBackupButtonLoading(buttonId, isLoading, loadingText) {
  const btn = document.getElementById(buttonId);
  if (!btn) return () => {};
  if (isLoading) {
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.classList.add("is-loading");
    if (loadingText) btn.textContent = loadingText;
  }
  return () => {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
  };
}

function setStatusTextClass(elementId, status) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.remove("status-ok", "status-warning", "status-error");
  const normalized = String(status || "").toUpperCase();
  if (["GOOD", "READY", "SUCCESS"].some((key) => normalized.includes(key))) {
    el.classList.add("status-ok");
  } else if (["WARNING", "MANUAL", "DRY"].some((key) => normalized.includes(key))) {
    el.classList.add("status-warning");
  } else if (["ERROR", "FAILED", "NOT_READY"].some((key) => normalized.includes(key))) {
    el.classList.add("status-error");
  }
}

function renderBackupTableCounts(rows = []) {
  const body = document.getElementById("backupTableCountsBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="3">No table counts loaded.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.table)}</td>
      <td>${row.ok ? statusBadge("GOOD") : statusBadge("ERROR")}</td>
      <td>${row.count ?? escapeHtml(row.error || "-")}</td>
    </tr>
  `).join("");
}

function renderBackupRecentFiles(rows = []) {
  const body = document.getElementById("backupRecentFilesBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="3">No backup files loaded.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.size_human || row.size_bytes || "-")}</td>
      <td>${escapeHtml(formatDate(row.modified_at))}</td>
    </tr>
  `).join("");
}

function renderBackupStatus(data) {
  setText("backupStatusInfo", `Backup status loaded at ${nowText()}.`);
  setText("backupOverallStatus", data.backup_status || "-");
  setStatusTextClass("backupOverallStatus", data.backup_status);
  setText("backupDbName", data.database?.name || "-");
  setText("backupTableCount", data.database?.table_count ?? "-");
  setText("backupFileCount", data.backup_directory?.backup_file_count ?? "-");
  setText("backupDirExists", data.backup_directory?.exists ? "YES" : "NO");
  setText("backupDirWritable", data.backup_directory?.writable ? "YES" : "NO");

  setText("backupDirectoryOutput", JSON.stringify(data.backup_directory || {}, null, 2));
  setText("latestBackupOutput", JSON.stringify(data.backup_directory?.latest_backup || {}, null, 2));
  setText("backupWarningsOutput", JSON.stringify({ warnings: data.warnings || [], errors: data.errors || [] }, null, 2));
  setText("backupNextActionsOutput", JSON.stringify(data.next_actions || [], null, 2));
  setText("backupStatusOutput", JSON.stringify(data, null, 2));

  renderBackupTableCounts(data.important_table_counts || []);
  renderBackupRecentFiles(data.backup_directory?.recent_files || []);
}

async function loadBackupStatus() {
  const restoreBtn = setBackupButtonLoading("loadBackupStatusBtn", true, "Loading...");
  try {
    setText("backupStatusInfo", "Loading backup status...");
    const data = await AdminAPI.get("/ai/backup/status");
    renderBackupStatus(data);
    setText("backupStatusInfo", `Backup status loaded at ${nowText()}.`);
  } catch (error) {
    console.error("Backup status load error:", error);
    setText("backupStatusInfo", `Backup status load failed: ${error.message}`);
    setText("backupStatusOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function loadBackupChecklist() {
  const restoreBtn = setBackupButtonLoading("loadBackupChecklistBtn", true, "Loading...");
  try {
    setText("backupChecklistOutput", "Loading backup checklist...");
    const data = await AdminAPI.get("/ai/backup/checklist");
    setText("backupChecklistOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Backup checklist load error:", error);
    setText("backupChecklistOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function runBackupStatusTest() {
  const restoreBtn = setBackupButtonLoading("runBackupStatusTestBtn", true, "Testing...");
  try {
    const scenario = document.getElementById("backupStatusTestScenario")?.value || "current";
    setText("backupChecklistOutput", `Running backup status test: ${scenario}...`);
    const data = await AdminAPI.post("/ai/backup/status/test", { scenario });
    setText("backupChecklistOutput", JSON.stringify(data, null, 2));

    if (data.status) {
      renderBackupStatus(data.status);
    }
  } catch (error) {
    console.error("Backup status test error:", error);
    setText("backupChecklistOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}


async function runManualBackup() {
  try {
    const dryRun = (document.getElementById("manualBackupDryRun")?.value || "true") === "true";
    const gzip = (document.getElementById("manualBackupGzip")?.value || "true") === "true";
    const confirmAction = document.getElementById("manualBackupConfirmAction")?.value || "";
    const confirmText = document.getElementById("manualBackupConfirmText")?.value || "";

    const payload = {
      dry_run: dryRun,
      gzip,
      confirm_action: confirmAction,
      confirm_text: confirmText
    };

    setText("manualBackupInfo", dryRun ? "Running manual backup dry-run..." : "Running manual DB backup. Please wait...");
    const data = await AdminAPI.post("/ai/backup/manual", payload);
    setText("manualBackupInfo", `Manual backup completed. Status: ${data.backup_status || "UNKNOWN"}`);
    setText("manualBackupOutput", JSON.stringify(data, null, 2));

    if (data.latest_status) {
      renderBackupStatus(data.latest_status);
    } else {
      await loadBackupStatus();
    }
    await loadBackupHistory();
    await loadBackupHistoryStats();
  } catch (error) {
    console.error("Manual backup error:", error);
    setText("manualBackupInfo", `Manual backup failed: ${error.message}`);
    setText("manualBackupOutput", JSON.stringify(error, null, 2));
  }
}

async function loadManualBackupChecklist() {
  try {
    const data = await AdminAPI.get("/ai/backup/manual/checklist");
    setText("manualBackupOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Manual backup checklist error:", error);
    setText("manualBackupOutput", JSON.stringify(error, null, 2));
  }
}

async function runManualBackupTest() {
  try {
    const data = await AdminAPI.post("/ai/backup/manual/test", { scenario: "dry_run" });
    setText("manualBackupInfo", `Manual backup test completed. Status: ${data.backup_status || data.test_status || "UNKNOWN"}`);
    setText("manualBackupOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Manual backup test error:", error);
    setText("manualBackupInfo", `Manual backup test failed: ${error.message}`);
    setText("manualBackupOutput", JSON.stringify(error, null, 2));
  }
}


// ======================================================
// Phase 13-3: Backup History Storage
// ======================================================
function renderBackupHistoryRows(rows = []) {
  const body = document.getElementById("backupHistoryBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7">No backup history loaded.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.id)}</td>
      <td>${statusBadge(row.backup_status || "UNKNOWN")}</td>
      <td>${escapeHtml(row.source || "-")}</td>
      <td class="wrap-cell">${escapeHtml(row.file_name || "-")}</td>
      <td>${escapeHtml(row.size_human || row.size_bytes || "-")}</td>
      <td>${escapeHtml(formatDate(row.completed_at || row.created_at))}</td>
      <td class="wrap-cell">${escapeHtml(row.error_message || row.error_code || "-")}</td>
    </tr>
  `).join("");
}

function renderBackupHistoryStats(data) {
  const summary = data.summary || {};
  setText("backupHistoryStatus", data.history_status || "-");
  setStatusTextClass("backupHistoryStatus", data.history_status);
  setText("backupHistoryTotalCount", summary.total_count ?? "-");
  setText("backupHistorySuccessCount", summary.success_count ?? "-");
  setText("backupHistoryFailedCount", summary.failed_count ?? "-");
  setText("backupHistoryStatsOutput", JSON.stringify(data, null, 2));
}

async function loadBackupHistory() {
  try {
    const limit = document.getElementById("backupHistoryLimit")?.value || 20;
    const status = document.getElementById("backupHistoryStatusFilter")?.value || "";
    const query = new URLSearchParams({ limit });
    if (status) query.set("status", status);
    const data = await AdminAPI.get(`/ai/backup/history?${query.toString()}`);
    renderBackupHistoryRows(data.results || []);
    setText("backupHistoryInfo", `Backup history loaded. Count: ${data.count || 0}`);
    setText("backupHistoryOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Backup history load error:", error);
    setText("backupHistoryInfo", `Backup history load failed: ${error.message}`);
    setText("backupHistoryOutput", JSON.stringify(error, null, 2));
  }
}

async function loadBackupHistoryStats() {
  try {
    const days = document.getElementById("backupHistoryStatsDays")?.value || 30;
    const data = await AdminAPI.get(`/ai/backup/history/stats?days=${encodeURIComponent(days)}`);
    renderBackupHistoryStats(data);
    setText("backupHistoryInfo", `Backup history stats loaded. Status: ${data.history_status || "UNKNOWN"}`);
  } catch (error) {
    console.error("Backup history stats load error:", error);
    setText("backupHistoryInfo", `Backup history stats failed: ${error.message}`);
    setText("backupHistoryStatsOutput", JSON.stringify(error, null, 2));
  }
}

async function syncBackupFilesHistory() {
  try {
    const limit = Number(document.getElementById("backupHistorySyncLimit")?.value || 100);
    const data = await AdminAPI.post("/ai/backup/history/sync-files", { limit });
    setText("backupHistoryInfo", `Backup file sync completed. Inserted: ${data.inserted_count || 0}, skipped: ${data.skipped_count || 0}`);
    setText("backupHistoryOutput", JSON.stringify(data, null, 2));
    await loadBackupHistory();
    await loadBackupHistoryStats();
  } catch (error) {
    console.error("Backup history sync error:", error);
    setText("backupHistoryInfo", `Backup history sync failed: ${error.message}`);
    setText("backupHistoryOutput", JSON.stringify(error, null, 2));
  }
}

async function loadBackupHistoryChecklist() {
  try {
    const data = await AdminAPI.get("/ai/backup/history/checklist");
    setText("backupHistoryOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Backup history checklist error:", error);
    setText("backupHistoryOutput", JSON.stringify(error, null, 2));
  }
}

async function runBackupHistoryTest() {
  try {
    const data = await AdminAPI.post("/ai/backup/history/test", { scenario: "current" });
    setText("backupHistoryInfo", `Backup history test completed. Status: ${data.test_status || "UNKNOWN"}`);
    setText("backupHistoryOutput", JSON.stringify(data, null, 2));
    await loadBackupHistory();
    await loadBackupHistoryStats();
  } catch (error) {
    console.error("Backup history test error:", error);
    setText("backupHistoryInfo", `Backup history test failed: ${error.message}`);
    setText("backupHistoryOutput", JSON.stringify(error, null, 2));
  }
}


// ======================================================
// Phase 13-4: Restore Readiness Checklist
// ======================================================
function renderRestoreChecklistRows(rows = []) {
  const body = document.getElementById("restoreChecklistBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4">No restore checklist loaded.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.group || "-")}</td>
      <td class="wrap-cell">${escapeHtml(row.label || row.key || "-")}</td>
      <td>${row.required ? "YES" : "NO"}</td>
      <td>${statusBadge(row.status || "UNKNOWN")}</td>
    </tr>
  `).join("");
}

function renderRestoreReadiness(data) {
  setText("restoreReadinessInfo", `Restore readiness loaded at ${nowText()}.`);
  setText("restoreReadinessStatus", data.restore_readiness_status || "-");
  setStatusTextClass("restoreReadinessStatus", data.restore_readiness_status);
  setText("restoreCurrentDb", data.database?.current_db || "-");
  setText("restoreLatestBackupName", data.latest_restorable_backup?.file_name || "-");
  setText("restoreBackupReadable", data.latest_restorable_backup?.readable ? "YES" : "NO");
  setText("restoreTargetDb", data.restore_policy?.target_db || "NOT SET");
  setText("restoreExecutionEnabled", data.restore_policy?.restore_execution_enabled ? "ENABLED" : "DISABLED");

  setText("restoreLatestBackupOutput", JSON.stringify(data.latest_restorable_backup || {}, null, 2));
  setText("restorePolicyOutput", JSON.stringify(data.restore_policy || {}, null, 2));
  setText("restoreWarningsOutput", JSON.stringify({ warnings: data.warnings || [], errors: data.errors || [] }, null, 2));
  setText("restoreNextActionsOutput", JSON.stringify(data.next_actions || [], null, 2));
  setText("restoreReadinessOutput", JSON.stringify(data, null, 2));
  renderRestoreChecklistRows(data.checklist || []);
}

async function loadRestoreReadiness() {
  const restoreBtn = setBackupButtonLoading("loadRestoreReadinessBtn", true, "Loading...");
  try {
    setText("restoreReadinessInfo", "Loading restore readiness...");
    const data = await AdminAPI.get("/ai/backup/restore-readiness");
    renderRestoreReadiness(data);
  } catch (error) {
    console.error("Restore readiness load error:", error);
    setText("restoreReadinessInfo", `Restore readiness load failed: ${error.message}`);
    setText("restoreReadinessOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function loadRestoreReadinessChecklist() {
  const restoreBtn = setBackupButtonLoading("loadRestoreReadinessChecklistBtn", true, "Loading...");
  try {
    const data = await AdminAPI.get("/ai/backup/restore-readiness/checklist");
    setText("restoreReadinessInfo", "Restore checklist loaded.");
    setText("restoreReadinessOutput", JSON.stringify(data, null, 2));
    renderRestoreChecklistRows((data.checklist || []).map((item) => ({ ...item, group: "checklist", status: item.required ? "REQUIRED" : "OPTIONAL" })));
  } catch (error) {
    console.error("Restore checklist load error:", error);
    setText("restoreReadinessInfo", `Restore checklist load failed: ${error.message}`);
    setText("restoreReadinessOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function runRestoreReadinessTest() {
  const restoreBtn = setBackupButtonLoading("runRestoreReadinessTestBtn", true, "Testing...");
  try {
    const scenario = document.getElementById("restoreReadinessTestScenario")?.value || "current";
    setText("restoreReadinessInfo", `Running restore readiness test: ${scenario}...`);
    const data = await AdminAPI.post("/ai/backup/restore-readiness/test", { scenario });
    setText("restoreReadinessInfo", `Restore readiness test completed. Status: ${data.test_status || "UNKNOWN"}`);
    setText("restoreReadinessOutput", JSON.stringify(data, null, 2));
    if (data.status) renderRestoreReadiness(data.status);
  } catch (error) {
    console.error("Restore readiness test error:", error);
    setText("restoreReadinessInfo", `Restore readiness test failed: ${error.message}`);
    setText("restoreReadinessOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}



function renderSystemMonitoring(data) {
  setText("systemMonitoringInfo", `Monitoring dashboard loaded at ${nowText()}.`);
  setText("systemMonitoringStatus", data.monitoring_status || "-");
  setStatusTextClass("systemMonitoringStatus", data.monitoring_status);
  setText("systemMonitoringDbStatus", data.db?.ok ? "GOOD" : "ERROR");
  setText("systemMonitoringDbLatency", data.db?.latency_ms !== undefined ? `${data.db.latency_ms} ms` : "-");
  setText("systemMonitoringPendingQueue", data.queue?.pending ?? "-");
  setText("systemMonitoringFailedQueue", data.queue?.failed ?? "-");
  setText("systemMonitoringMemoryCount", data.memory?.ai_memory_count ?? "-");
  setText("systemMonitoringRecentBufferCount", data.memory?.recent_buffer_count ?? "-");
  setText("systemMonitoringBackupFiles", data.backup?.backup_file_count ?? "-");
  setText("systemMonitoringOperationErrors", data.operation_logs?.error_24h ?? "-");
  setText("systemMonitoringNodeUptime", data.process?.process_uptime_human || "-");
  setText("systemMonitoringRssMemory", data.process?.memory?.rss_human || "-");
  setText("systemMonitoringFreeMemory", data.process?.system_memory?.free_human || "-");

  setText("systemMonitoringWarnings", (data.warnings || []).length ? data.warnings.join("\n") : "No warnings");
  setText("systemMonitoringErrors", (data.errors || []).length ? data.errors.join("\n") : "No errors");
  setText("systemMonitoringQueueMemoryOutput", JSON.stringify({
    queue: data.queue,
    memory: data.memory,
    operation_logs: data.operation_logs,
    thresholds: data.thresholds
  }, null, 2));
  setText("systemMonitoringBackupProcessOutput", JSON.stringify({
    backup: data.backup,
    process: data.process,
    next_actions: data.next_actions
  }, null, 2));
  setText("systemMonitoringOutput", JSON.stringify(data, null, 2));
}

async function loadSystemMonitoringDashboard() {
  const restoreBtn = setBackupButtonLoading("loadSystemMonitoringBtn", true, "Loading...");
  try {
    setText("systemMonitoringInfo", "Loading system monitoring dashboard...");
    const data = await AdminAPI.get("/ai/monitoring/system");
    renderSystemMonitoring(data);
  } catch (error) {
    console.error("System monitoring load error:", error);
    setText("systemMonitoringInfo", `System monitoring load failed: ${error.message}`);
    setText("systemMonitoringOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function loadSystemMonitoringChecklist() {
  const restoreBtn = setBackupButtonLoading("loadSystemMonitoringChecklistBtn", true, "Loading...");
  try {
    const data = await AdminAPI.get("/ai/monitoring/checklist");
    setText("systemMonitoringInfo", "System monitoring checklist loaded.");
    setText("systemMonitoringChecklistOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("System monitoring checklist error:", error);
    setText("systemMonitoringInfo", `System monitoring checklist failed: ${error.message}`);
    setText("systemMonitoringChecklistOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function runSystemMonitoringTest() {
  const restoreBtn = setBackupButtonLoading("runSystemMonitoringTestBtn", true, "Testing...");
  try {
    const scenario = document.getElementById("systemMonitoringTestScenario")?.value || "current";
    setText("systemMonitoringInfo", `Running system monitoring test: ${scenario}...`);
    const data = await AdminAPI.post("/ai/monitoring/test", { scenario });
    setText("systemMonitoringInfo", `System monitoring test completed. Status: ${data.test_status || "UNKNOWN"}`);
    setText("systemMonitoringChecklistOutput", JSON.stringify(data, null, 2));
    if (data.dashboard) renderSystemMonitoring(data.dashboard);
  } catch (error) {
    console.error("System monitoring test error:", error);
    setText("systemMonitoringInfo", `System monitoring test failed: ${error.message}`);
    setText("systemMonitoringChecklistOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

function renderResourceMonitoring(data) {
  setText("resourceMonitoringInfo", `Resource monitoring loaded at ${nowText()}.`);
  setText("resourceMonitoringStatus", data.monitoring_status || "-");
  setStatusTextClass("resourceMonitoringStatus", data.monitoring_status);
  setText("resourceDiskFreePercent", data.disk?.free_percent !== null && data.disk?.free_percent !== undefined ? `${data.disk.free_percent}%` : "-");
  setText("resourceDiskFreeHuman", data.disk?.free_human || "-");
  setText("resourceDbLatency", data.db?.latency_ms !== null && data.db?.latency_ms !== undefined ? `${data.db.latency_ms} ms` : "-");
  setText("resourceDbSize", data.db?.db_size_human || "-");
  setText("resourceDbConnections", data.db?.active_connections !== null && data.db?.active_connections !== undefined ? `${data.db.active_connections}/${data.db.max_connections || "?"}` : "-");
  setText("resourcePendingQueue", data.queue?.counts?.pending ?? "-");
  setText("resourceFailedQueue", data.queue?.counts?.failed ?? "-");
  setText("resourceStuckProcessing", data.queue?.stuck_processing_count ?? "-");
  setText("resourceApiWorkerStatus", data.worker?.workers?.api_server?.status || "-");
  setText("resourceSummaryWorkerStatus", data.worker?.workers?.summary_worker?.status || "-");
  setText("resourceDailyWorkerStatus", data.worker?.workers?.daily_operation_worker?.status || "-");

  setText("resourceMonitoringWarnings", (data.warnings || []).length ? data.warnings.join("\n") : "No warnings");
  setText("resourceMonitoringErrors", (data.errors || []).length ? data.errors.join("\n") : "No errors");
  setText("resourceDiskDbOutput", JSON.stringify({ disk: data.disk, db: data.db, thresholds: data.thresholds }, null, 2));
  setText("resourceQueueWorkerOutput", JSON.stringify({ queue: data.queue, worker: data.worker, next_actions: data.next_actions }, null, 2));
  setText("resourceMonitoringOutput", JSON.stringify(data, null, 2));
}

async function loadResourceMonitoring() {
  const restoreBtn = setBackupButtonLoading("loadResourceMonitoringBtn", true, "Loading...");
  try {
    setText("resourceMonitoringInfo", "Loading detailed resource monitoring...");
    const data = await AdminAPI.get("/ai/monitoring/detailed");
    renderResourceMonitoring(data);
  } catch (error) {
    console.error("Resource monitoring load error:", error);
    setText("resourceMonitoringInfo", `Resource monitoring load failed: ${error.message}`);
    setText("resourceMonitoringOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function loadWorkerMonitoring() {
  const restoreBtn = setBackupButtonLoading("loadWorkerMonitoringBtn", true, "Loading...");
  try {
    setText("resourceMonitoringInfo", "Loading worker status...");
    const data = await AdminAPI.get("/ai/monitoring/worker-status");
    setText("resourceMonitoringInfo", "Worker status loaded.");
    setText("resourceQueueWorkerOutput", JSON.stringify(data.worker, null, 2));
    setText("resourceWorkerCommandsOutput", JSON.stringify(data.recommended_commands || [], null, 2));
    setText("resourceMonitoringOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Worker monitoring error:", error);
    setText("resourceMonitoringInfo", `Worker monitoring failed: ${error.message}`);
    setText("resourceMonitoringOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function loadResourceMonitoringChecklist() {
  const restoreBtn = setBackupButtonLoading("loadResourceMonitoringChecklistBtn", true, "Loading...");
  try {
    const data = await AdminAPI.get("/ai/monitoring/resource-checklist");
    setText("resourceMonitoringInfo", "Resource monitoring checklist loaded.");
    setText("resourceMonitoringChecklistOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Resource checklist error:", error);
    setText("resourceMonitoringInfo", `Resource checklist failed: ${error.message}`);
    setText("resourceMonitoringChecklistOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function runResourceMonitoringTest() {
  const restoreBtn = setBackupButtonLoading("runResourceMonitoringTestBtn", true, "Testing...");
  try {
    const scenario = document.getElementById("resourceMonitoringTestScenario")?.value || "current";
    setText("resourceMonitoringInfo", `Running resource monitoring test: ${scenario}...`);
    const data = await AdminAPI.post("/ai/monitoring/detailed/test", { scenario });
    setText("resourceMonitoringInfo", `Resource monitoring test completed. Status: ${data.test_status || "UNKNOWN"}`);
    setText("resourceMonitoringChecklistOutput", JSON.stringify(data, null, 2));
    if (data.detailed) renderResourceMonitoring(data.detailed);
  } catch (error) {
    console.error("Resource monitoring test error:", error);
    setText("resourceMonitoringInfo", `Resource monitoring test failed: ${error.message}`);
    setText("resourceMonitoringChecklistOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}


function renderAlertRulesStatus(data) {
  setText("alertRulesInfo", `Alert status loaded at ${nowText()}.`);
  setText("alertRulesStatus", data.alert_status || "-");
  setStatusTextClass("alertRulesStatus", data.alert_status);
  setText("alertRulesTotal", data.evaluation?.rules_total ?? "-");
  setText("alertRulesEnabled", data.evaluation?.enabled_rules ?? "-");
  setText("alertRulesActiveCount", data.evaluation?.alert_count ?? "-");
  setText("alertRulesCriticalCount", data.evaluation?.critical_count ?? "-");
  setText("alertRulesWarningCount", data.evaluation?.warning_count ?? "-");
  setText("alertRulesActiveOutput", (data.evaluation?.alerts || []).length ? JSON.stringify(data.evaluation.alerts, null, 2) : "No active alerts");
  setText("alertRulesNextActionsOutput", (data.next_actions || []).length ? JSON.stringify(data.next_actions, null, 2) : "No next actions");
  setText("alertRulesOutput", JSON.stringify(data, null, 2));
}

async function loadAlertRulesStatus() {
  const restoreBtn = setBackupButtonLoading("loadAlertRulesStatusBtn", true, "Loading...");
  try {
    setText("alertRulesInfo", "Loading alert rules status...");
    const data = await AdminAPI.get("/ai/monitoring/alerts/status");
    renderAlertRulesStatus(data);
  } catch (error) {
    console.error("Alert rules status error:", error);
    setText("alertRulesInfo", `Alert rules status failed: ${error.message}`);
    setText("alertRulesOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function loadAlertRulesCatalog() {
  const restoreBtn = setBackupButtonLoading("loadAlertRulesCatalogBtn", true, "Loading...");
  try {
    const data = await AdminAPI.get("/ai/monitoring/alerts/catalog");
    setText("alertRulesInfo", "Alert rules catalog loaded.");
    setText("alertRulesCatalogOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Alert rules catalog error:", error);
    setText("alertRulesInfo", `Alert catalog failed: ${error.message}`);
    setText("alertRulesCatalogOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function loadAlertRulesChecklist() {
  const restoreBtn = setBackupButtonLoading("loadAlertRulesChecklistBtn", true, "Loading...");
  try {
    const data = await AdminAPI.get("/ai/monitoring/alerts/checklist");
    setText("alertRulesInfo", "Alert rules checklist loaded.");
    setText("alertRulesCatalogOutput", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Alert rules checklist error:", error);
    setText("alertRulesInfo", `Alert checklist failed: ${error.message}`);
    setText("alertRulesCatalogOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}

async function runAlertRulesTest() {
  const restoreBtn = setBackupButtonLoading("runAlertRulesTestBtn", true, "Testing...");
  try {
    const scenario = document.getElementById("alertRulesTestScenario")?.value || "current";
    setText("alertRulesInfo", `Running alert rules test: ${scenario}...`);
    const data = await AdminAPI.post("/ai/monitoring/alerts/test", { scenario });
    setText("alertRulesInfo", `Alert rules test completed. Status: ${data.test_status || "UNKNOWN"}`);
    setText("alertRulesCatalogOutput", JSON.stringify(data, null, 2));
    if (data.alert_status) renderAlertRulesStatus(data.alert_status);
    if (data.evaluation) {
      const statusLike = {
        alert_status: data.test_status,
        evaluation: data.evaluation,
        next_actions: (data.evaluation.alerts || []).map((a) => ({ rule_key: a.rule_key, action: a.operator_action }))
      };
      renderAlertRulesStatus(statusLike);
    }
  } catch (error) {
    console.error("Alert rules test error:", error);
    setText("alertRulesInfo", `Alert rules test failed: ${error.message}`);
    setText("alertRulesCatalogOutput", JSON.stringify(error, null, 2));
  } finally {
    restoreBtn();
  }
}


document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("refreshBtn");
  const loadQueueBtn = document.getElementById("loadQueueBtn");
  const loadDailyHealthBtn = document.getElementById("loadDailyHealthBtn");
  const saveDailyHealthBtn = document.getElementById("saveDailyHealthBtn");
  const loadDailyHealthHistoryBtn = document.getElementById("loadDailyHealthHistoryBtn");
  const loadOperationChecklistBtn = document.getElementById("loadOperationChecklistBtn");
  const resetOperationChecklistBtn = document.getElementById("resetOperationChecklistBtn");
  const operationChecklistDate = document.getElementById("operationChecklistDate");
  const loadAutomationConfigBtn = document.getElementById("loadAutomationConfigBtn");
  const saveAutomationConfigBtn = document.getElementById("saveAutomationConfigBtn");
  const runAutomationNowBtn = document.getElementById("runAutomationNowBtn");
  const loadAutomationHistoryBtn = document.getElementById("loadAutomationHistoryBtn");
  const loadAutomationSafetyBtn = document.getElementById("loadAutomationSafetyBtn");
  const unlockAutomationBtn = document.getElementById("unlockAutomationBtn");
  const loadOperationLogsBtn = document.getElementById("loadOperationLogsBtn");
  const saveManualOperationLogBtn = document.getElementById("saveManualOperationLogBtn");
  const cleanupOperationLogsBtn = document.getElementById("cleanupOperationLogsBtn");
  const operationReportDate = document.getElementById("operationReportDate");
  const loadOperationReportBtn = document.getElementById("loadOperationReportBtn");
  const loadPhase9FinalChecklistBtn = document.getElementById("loadPhase9FinalChecklistBtn");
  const resetPhase9FinalChecklistBtn = document.getElementById("resetPhase9FinalChecklistBtn");
  const runPhase9FinalDecisionBtn = document.getElementById("runPhase9FinalDecisionBtn");
  const retryFailedBtn = document.getElementById("retryFailedBtn");
  const retrySelectedQueueBtn = document.getElementById("retrySelectedQueueBtn");
  const resetStuckProcessingBtn = document.getElementById("resetStuckProcessingBtn");
  const selectAllQueueCheckbox = document.getElementById("selectAllQueueCheckbox");
  const loadMemoryBtn = document.getElementById("loadMemoryBtn");
  const searchMemoryBtn = document.getElementById("searchMemoryBtn");
  const saveManualMemoryBtn = document.getElementById("saveManualMemoryBtn");
  const clearManualMemoryBtn = document.getElementById("clearManualMemoryBtn");
  const loadAssetsBtn = document.getElementById("loadAssetsBtn");
  const createAssetBtn = document.getElementById("createAssetBtn");
  const clearAssetFormBtn = document.getElementById("clearAssetFormBtn");
  const updateAssetBtn = document.getElementById("updateAssetBtn");
  const clearEditAssetBtn = document.getElementById("clearEditAssetBtn");
  const loadSessionLogsBtn = document.getElementById("loadSessionLogsBtn");
  const runContextBuildBtn = document.getElementById("runContextBuildBtn");
  const clearContextBuildBtn = document.getElementById("clearContextBuildBtn");
  const runContextPreviewBtn = document.getElementById("runContextPreviewBtn");
  const clearContextPreviewBtn = document.getElementById("clearContextPreviewBtn");
  const copyContextPromptBtn = document.getElementById("copyContextPromptBtn");
  const runContextAssemblyBtn = document.getElementById("runContextAssemblyBtn");
  const copyAssemblyPromptBtn = document.getElementById("copyAssemblyPromptBtn");
  const clearContextAssemblyBtn = document.getElementById("clearContextAssemblyBtn");
  const floatingTopBtn = document.getElementById("floatingTopBtn");
  const runPipelineDraftBtn = document.getElementById("runPipelineDraftBtn");
  const copyPipelinePayloadBtn = document.getElementById("copyPipelinePayloadBtn");
  const clearPipelineDraftBtn = document.getElementById("clearPipelineDraftBtn");
  const runResponseTestBtn = document.getElementById("runResponseTestBtn");
  const copyResponseAnswerBtn = document.getElementById("copyResponseAnswerBtn");
  const clearResponseTestBtn = document.getElementById("clearResponseTestBtn");
  const loadResponseStorageBtn = document.getElementById("loadResponseStorageBtn");
  const cleanupResponseBufferBtn = document.getElementById("cleanupResponseBufferBtn");
  const loadSummaryWorkerStatusBtn = document.getElementById("loadSummaryWorkerStatusBtn");
  const processSummaryBatchBtn = document.getElementById("processSummaryBatchBtn");
  const drainSummaryQueueBtn = document.getElementById("drainSummaryQueueBtn");
  const loadSummaryIntegrationBtn = document.getElementById("loadSummaryIntegrationBtn");
  const runContextRebuildBtn = document.getElementById("runContextRebuildBtn");
  const clearContextRebuildBtn = document.getElementById("clearContextRebuildBtn");
  const runPhase10FinalDecisionBtn = document.getElementById("runPhase10FinalDecisionBtn");
  const clearPhase10FinalBtn = document.getElementById("clearPhase10FinalBtn");
  const loadPhase10CompletionReportBtn = document.getElementById("loadPhase10CompletionReportBtn");
  const loadModelProvidersBtn = document.getElementById("loadModelProvidersBtn");
  const loadNormalizedProfilesBtn = document.getElementById("loadNormalizedProfilesBtn");
  const runProviderTestBtn = document.getElementById("runProviderTestBtn");
  const loadOpenAiLiveStatusBtn = document.getElementById("loadOpenAiLiveStatusBtn");
  const runOpenAiLiveTestBtn = document.getElementById("runOpenAiLiveTestBtn");
  const loadOpenAiAvailableModelsBtn = document.getElementById("loadOpenAiAvailableModelsBtn");
  const loadAnthropicLiveStatusBtn = document.getElementById("loadAnthropicLiveStatusBtn");
  const loadAnthropicAvailableModelsBtn = document.getElementById("loadAnthropicAvailableModelsBtn");
  const runAnthropicLiveTestBtn = document.getElementById("runAnthropicLiveTestBtn");
  const loadGeminiLiveStatusBtn = document.getElementById("loadGeminiLiveStatusBtn");
  const loadGeminiAvailableModelsBtn = document.getElementById("loadGeminiAvailableModelsBtn");
  const runGeminiLiveTestBtn = document.getElementById("runGeminiLiveTestBtn");
  const loadProviderRouterStatusBtn = document.getElementById("loadProviderRouterStatusBtn");
  const loadProviderRouterRulesBtn = document.getElementById("loadProviderRouterRulesBtn");
  const selectProviderRouteBtn = document.getElementById("selectProviderRouteBtn");
  const testProviderRouteBtn = document.getElementById("testProviderRouteBtn");
  const clearProviderRouterBtn = document.getElementById("clearProviderRouterBtn");
  const loadFallbackScenariosBtn = document.getElementById("loadFallbackScenariosBtn");
  const runFallbackTestBtn = document.getElementById("runFallbackTestBtn");
  const runFallbackMatrixBtn = document.getElementById("runFallbackMatrixBtn");
  const loadPhase11FinalPrepBtn = document.getElementById("loadPhase11FinalPrepBtn");
  const clearProviderFallbackBtn = document.getElementById("clearProviderFallbackBtn");
  const loadPhase11ChecklistBtn = document.getElementById("loadPhase11ChecklistBtn");
  const runPhase11FinalDecisionBtn = document.getElementById("runPhase11FinalDecisionBtn");
  const clearPhase11FinalBtn = document.getElementById("clearPhase11FinalBtn");
  const loadAdminSecurityStatusBtn = document.getElementById("loadAdminSecurityStatusBtn");
  const loadAdminSecurityEventsBtn = document.getElementById("loadAdminSecurityEventsBtn");
  const loadAdminPermissionStatusBtn = document.getElementById("loadAdminPermissionStatusBtn");
  const loadAdminPermissionRolesBtn = document.getElementById("loadAdminPermissionRolesBtn");
  const loadAdminPermissionPoliciesBtn = document.getElementById("loadAdminPermissionPoliciesBtn");
  const runAdminPermissionCheckBtn = document.getElementById("runAdminPermissionCheckBtn");
  const loadAdminPermissionEventsBtn = document.getElementById("loadAdminPermissionEventsBtn");

  if (refreshBtn) refreshBtn.addEventListener("click", loadDashboard);
  if (loadDailyHealthBtn) loadDailyHealthBtn.addEventListener("click", loadDailyHealthCheck);
  if (saveDailyHealthBtn) saveDailyHealthBtn.addEventListener("click", saveDailyHealthCheckToDb);
  if (loadDailyHealthHistoryBtn) loadDailyHealthHistoryBtn.addEventListener("click", loadDailyHealthHistory);
  if (operationChecklistDate && !operationChecklistDate.value) operationChecklistDate.value = todayDateInputValue();
  if (loadOperationChecklistBtn) loadOperationChecklistBtn.addEventListener("click", loadOperationChecklist);
  if (resetOperationChecklistBtn) resetOperationChecklistBtn.addEventListener("click", resetOperationChecklist);
  if (operationChecklistDate) operationChecklistDate.addEventListener("change", loadOperationChecklist);
  if (loadAutomationConfigBtn) loadAutomationConfigBtn.addEventListener("click", loadAutomationConfig);
  if (saveAutomationConfigBtn) saveAutomationConfigBtn.addEventListener("click", saveAutomationConfig);
  if (runAutomationNowBtn) runAutomationNowBtn.addEventListener("click", runAutomationNow);
  if (loadAutomationHistoryBtn) loadAutomationHistoryBtn.addEventListener("click", loadAutomationHistory);
  if (loadAutomationSafetyBtn) loadAutomationSafetyBtn.addEventListener("click", loadAutomationSafetyStatus);
  if (unlockAutomationBtn) unlockAutomationBtn.addEventListener("click", unlockAutomationLock);
  if (loadOperationLogsBtn) loadOperationLogsBtn.addEventListener("click", loadOperationLogs);
  if (saveManualOperationLogBtn) saveManualOperationLogBtn.addEventListener("click", saveManualOperationLog);
  if (cleanupOperationLogsBtn) cleanupOperationLogsBtn.addEventListener("click", cleanupOperationLogs);
  if (operationReportDate && !operationReportDate.value) operationReportDate.value = todayDateInputValue();
  if (loadOperationReportBtn) loadOperationReportBtn.addEventListener("click", loadOperationReportSummary);
  if (loadPhase9FinalChecklistBtn) loadPhase9FinalChecklistBtn.addEventListener("click", loadPhase9FinalChecklist);
  if (resetPhase9FinalChecklistBtn) resetPhase9FinalChecklistBtn.addEventListener("click", resetPhase9FinalChecklist);
  if (runPhase9FinalDecisionBtn) runPhase9FinalDecisionBtn.addEventListener("click", runPhase9FinalDecision);
  if (operationReportDate) operationReportDate.addEventListener("change", loadOperationReportSummary);
  if (loadQueueBtn) loadQueueBtn.addEventListener("click", loadQueue);
  if (retryFailedBtn) retryFailedBtn.addEventListener("click", retryFailedQueue);
  if (retrySelectedQueueBtn) retrySelectedQueueBtn.addEventListener("click", retrySelectedQueue);
  if (resetStuckProcessingBtn) resetStuckProcessingBtn.addEventListener("click", resetStuckProcessingQueue);
  if (selectAllQueueCheckbox) {
    selectAllQueueCheckbox.addEventListener("change", (event) => {
      toggleAllFailedQueueRows(event.target.checked);
    });
  }
  if (loadMemoryBtn) loadMemoryBtn.addEventListener("click", loadRecentMemory);
  if (searchMemoryBtn) searchMemoryBtn.addEventListener("click", searchMemory);
  if (saveManualMemoryBtn) saveManualMemoryBtn.addEventListener("click", saveManualMemory);
  if (clearManualMemoryBtn) clearManualMemoryBtn.addEventListener("click", clearManualMemoryForm);
  if (loadAssetsBtn) loadAssetsBtn.addEventListener("click", loadAssets);
  if (createAssetBtn) createAssetBtn.addEventListener("click", createProjectAsset);
  if (clearAssetFormBtn) clearAssetFormBtn.addEventListener("click", clearAssetForm); 
  if (updateAssetBtn) updateAssetBtn.addEventListener("click", updateProjectAsset);
  if (clearEditAssetBtn) clearEditAssetBtn.addEventListener("click", clearEditAssetForm);
  if (loadSessionLogsBtn) loadSessionLogsBtn.addEventListener("click", loadSessionLogs);
  if (runContextBuildBtn) runContextBuildBtn.addEventListener("click", runContextBuild);
  if (clearContextBuildBtn) clearContextBuildBtn.addEventListener("click", clearContextBuildForm);
  if (runContextPreviewBtn) runContextPreviewBtn.addEventListener("click", runContextPreview);
  if (clearContextPreviewBtn) clearContextPreviewBtn.addEventListener("click", clearContextPreviewForm);
  if (copyContextPromptBtn) copyContextPromptBtn.addEventListener("click", copyContextPreviewPrompt);
  if (runContextAssemblyBtn) runContextAssemblyBtn.addEventListener("click", runContextAssembly);
  if (copyAssemblyPromptBtn) copyAssemblyPromptBtn.addEventListener("click", copyAssemblyPrompt);
  if (clearContextAssemblyBtn) clearContextAssemblyBtn.addEventListener("click", clearContextAssemblyForm);
  if (floatingTopBtn) floatingTopBtn.addEventListener("click", scrollAdminToTop);
  if (runPipelineDraftBtn) runPipelineDraftBtn.addEventListener("click", runPipelineDraft);
  if (copyPipelinePayloadBtn) copyPipelinePayloadBtn.addEventListener("click", copyPipelinePayload);
  if (clearPipelineDraftBtn) clearPipelineDraftBtn.addEventListener("click", clearPipelineDraftForm);
  if (runResponseTestBtn) runResponseTestBtn.addEventListener("click", runResponseTest);
  if (copyResponseAnswerBtn) copyResponseAnswerBtn.addEventListener("click", copyResponseAnswer);
  if (clearResponseTestBtn) clearResponseTestBtn.addEventListener("click", clearResponseTestForm);
  if (loadResponseStorageBtn) loadResponseStorageBtn.addEventListener("click", loadResponseStorageStatus);
  if (cleanupResponseBufferBtn) cleanupResponseBufferBtn.addEventListener("click", cleanupResponseRecentBuffer);
  if (loadSummaryWorkerStatusBtn) loadSummaryWorkerStatusBtn.addEventListener("click", loadSummaryWorkerStatus);
  if (processSummaryBatchBtn) processSummaryBatchBtn.addEventListener("click", processSummaryQueueBatchFromAdmin);
  if (drainSummaryQueueBtn) drainSummaryQueueBtn.addEventListener("click", drainSummaryQueueFromAdmin);
  if (loadSummaryIntegrationBtn) loadSummaryIntegrationBtn.addEventListener("click", loadSummaryIntegrationStatus);
  if (runPhase10FinalDecisionBtn) runPhase10FinalDecisionBtn.addEventListener("click", runPhase10FinalDecision);
  if (clearPhase10FinalBtn) clearPhase10FinalBtn.addEventListener("click", clearPhase10FinalDecision);
  if (loadPhase10CompletionReportBtn) loadPhase10CompletionReportBtn.addEventListener("click", loadPhase10CompletionReport);
  if (loadModelProvidersBtn) loadModelProvidersBtn.addEventListener("click", loadModelProviders);
  if (loadNormalizedProfilesBtn) loadNormalizedProfilesBtn.addEventListener("click", loadNormalizedModelProfiles);
  if (runProviderTestBtn) runProviderTestBtn.addEventListener("click", runProviderAdapterTest);
  if (loadOpenAiLiveStatusBtn) loadOpenAiLiveStatusBtn.addEventListener("click", loadOpenAiLiveStatus);
  if (runOpenAiLiveTestBtn) runOpenAiLiveTestBtn.addEventListener("click", runOpenAiLiveTest);
  if (loadOpenAiAvailableModelsBtn) loadOpenAiAvailableModelsBtn.addEventListener("click", loadOpenAiAvailableModels);
  if (loadAnthropicLiveStatusBtn) loadAnthropicLiveStatusBtn.addEventListener("click", loadAnthropicLiveStatus);
  if (loadAnthropicAvailableModelsBtn) loadAnthropicAvailableModelsBtn.addEventListener("click", loadAnthropicAvailableModels);
  if (runAnthropicLiveTestBtn) runAnthropicLiveTestBtn.addEventListener("click", runAnthropicLiveTest);
  if (loadGeminiLiveStatusBtn) loadGeminiLiveStatusBtn.addEventListener("click", loadGeminiLiveStatus);
  if (loadGeminiAvailableModelsBtn) loadGeminiAvailableModelsBtn.addEventListener("click", loadGeminiAvailableModels);
  if (runGeminiLiveTestBtn) runGeminiLiveTestBtn.addEventListener("click", runGeminiLiveTest);
  if (loadProviderRouterStatusBtn) loadProviderRouterStatusBtn.addEventListener("click", loadProviderRouterStatus);
  if (loadProviderRouterRulesBtn) loadProviderRouterRulesBtn.addEventListener("click", loadProviderRouterRules);
  if (selectProviderRouteBtn) selectProviderRouteBtn.addEventListener("click", selectProviderRouteFromAdmin);
  if (testProviderRouteBtn) testProviderRouteBtn.addEventListener("click", testProviderRouteFromAdmin);
  if (clearProviderRouterBtn) clearProviderRouterBtn.addEventListener("click", clearProviderRouter);
  if (loadFallbackScenariosBtn) loadFallbackScenariosBtn.addEventListener("click", loadFallbackScenarios);
  if (runFallbackTestBtn) runFallbackTestBtn.addEventListener("click", runFallbackTest);
  if (runFallbackMatrixBtn) runFallbackMatrixBtn.addEventListener("click", runFallbackMatrix);
  if (loadPhase11FinalPrepBtn) loadPhase11FinalPrepBtn.addEventListener("click", loadPhase11FinalPrep);
  if (clearProviderFallbackBtn) clearProviderFallbackBtn.addEventListener("click", clearProviderFallback);
  if (loadPhase11ChecklistBtn) loadPhase11ChecklistBtn.addEventListener("click", loadPhase11CompletionChecklist);
  if (runPhase11FinalDecisionBtn) runPhase11FinalDecisionBtn.addEventListener("click", runPhase11FinalDecision);
  if (clearPhase11FinalBtn) clearPhase11FinalBtn.addEventListener("click", clearPhase11FinalDecision);
  if (loadAdminSecurityStatusBtn) loadAdminSecurityStatusBtn.addEventListener("click", loadAdminSecurityStatus);
  if (loadAdminSecurityEventsBtn) loadAdminSecurityEventsBtn.addEventListener("click", loadAdminSecurityEvents);
  if (loadAdminPermissionStatusBtn) loadAdminPermissionStatusBtn.addEventListener("click", loadAdminPermissionStatus);
  if (loadAdminPermissionRolesBtn) loadAdminPermissionRolesBtn.addEventListener("click", loadAdminPermissionRoles);
  if (loadAdminPermissionPoliciesBtn) loadAdminPermissionPoliciesBtn.addEventListener("click", loadAdminPermissionPolicies);
  if (runAdminPermissionCheckBtn) runAdminPermissionCheckBtn.addEventListener("click", runAdminPermissionCheck);
  if (loadAdminPermissionEventsBtn) loadAdminPermissionEventsBtn.addEventListener("click", loadAdminPermissionEvents);
  if (loadDangerousStatusBtn) loadDangerousStatusBtn.addEventListener("click", loadDangerousActionStatus);
  if (loadDangerousCatalogBtn) loadDangerousCatalogBtn.addEventListener("click", loadDangerousActionCatalog);
  if (validateDangerousActionBtn) validateDangerousActionBtn.addEventListener("click", validateDangerousActionFromAdmin);
  if (runDangerousConfirmationTestBtn) runDangerousConfirmationTestBtn.addEventListener("click", runDangerousConfirmationTest);
  if (loadDangerousEventsBtn) loadDangerousEventsBtn.addEventListener("click", loadDangerousActionEvents);
  const loadApiErrorStatusBtn = document.getElementById("loadApiErrorStatusBtn");
  const loadApiErrorCatalogBtn = document.getElementById("loadApiErrorCatalogBtn");
  const loadApiErrorExamplesBtn = document.getElementById("loadApiErrorExamplesBtn");
  const runApiErrorTestBtn = document.getElementById("runApiErrorTestBtn");
  if (loadApiErrorStatusBtn) loadApiErrorStatusBtn.addEventListener("click", loadApiErrorStandardStatus);
  if (loadApiErrorCatalogBtn) loadApiErrorCatalogBtn.addEventListener("click", loadApiErrorCatalog);
  if (loadApiErrorExamplesBtn) loadApiErrorExamplesBtn.addEventListener("click", loadApiErrorExamples);
  if (runApiErrorTestBtn) runApiErrorTestBtn.addEventListener("click", runApiErrorResponseTest);
  const loadEnvConfigStatusBtn = document.getElementById("loadEnvConfigStatusBtn");
  const loadEnvConfigChecklistBtn = document.getElementById("loadEnvConfigChecklistBtn");
  const runEnvConfigTestBtn = document.getElementById("runEnvConfigTestBtn");
  if (loadEnvConfigStatusBtn) loadEnvConfigStatusBtn.addEventListener("click", loadEnvConfigStatus);
  if (loadEnvConfigChecklistBtn) loadEnvConfigChecklistBtn.addEventListener("click", loadEnvConfigChecklist);
  if (runEnvConfigTestBtn) runEnvConfigTestBtn.addEventListener("click", runEnvConfigValidationTest);
  const loadDeploymentStatusBtn = document.getElementById("loadDeploymentStatusBtn");
  const loadDeploymentChecklistBtn = document.getElementById("loadDeploymentChecklistBtn");
  const runDeploymentTestBtn = document.getElementById("runDeploymentTestBtn");
  if (loadDeploymentStatusBtn) loadDeploymentStatusBtn.addEventListener("click", loadDeploymentStatus);
  if (loadDeploymentChecklistBtn) loadDeploymentChecklistBtn.addEventListener("click", loadDeploymentChecklist);
  if (runDeploymentTestBtn) runDeploymentTestBtn.addEventListener("click", runDeploymentReadinessTest);
  const loadAdminConsoleModeStatusBtn = document.getElementById("loadAdminConsoleModeStatusBtn");
  const loadAdminConsoleModeChecklistBtn = document.getElementById("loadAdminConsoleModeChecklistBtn");
  const runAdminConsoleModeTestBtn = document.getElementById("runAdminConsoleModeTestBtn");
  const applyConsoleModeUiBtn = document.getElementById("applyConsoleModeUiBtn");
  const loadBackupStatusBtn = document.getElementById("loadBackupStatusBtn");
  const loadBackupChecklistBtn = document.getElementById("loadBackupChecklistBtn");
  const runBackupStatusTestBtn = document.getElementById("runBackupStatusTestBtn");
  const runManualBackupBtn = document.getElementById("runManualBackupBtn");
  const loadManualBackupChecklistBtn = document.getElementById("loadManualBackupChecklistBtn");
  const runManualBackupTestBtn = document.getElementById("runManualBackupTestBtn");
  const loadBackupHistoryBtn = document.getElementById("loadBackupHistoryBtn");
  const loadBackupHistoryStatsBtn = document.getElementById("loadBackupHistoryStatsBtn");
  const syncBackupFilesHistoryBtn = document.getElementById("syncBackupFilesHistoryBtn");
  const loadBackupHistoryChecklistBtn = document.getElementById("loadBackupHistoryChecklistBtn");
  const runBackupHistoryTestBtn = document.getElementById("runBackupHistoryTestBtn");
  const loadRestoreReadinessBtn = document.getElementById("loadRestoreReadinessBtn");
  const loadRestoreReadinessChecklistBtn = document.getElementById("loadRestoreReadinessChecklistBtn");
  const runRestoreReadinessTestBtn = document.getElementById("runRestoreReadinessTestBtn");
  const loadSystemMonitoringBtn = document.getElementById("loadSystemMonitoringBtn");
  const loadSystemMonitoringChecklistBtn = document.getElementById("loadSystemMonitoringChecklistBtn");
  const runSystemMonitoringTestBtn = document.getElementById("runSystemMonitoringTestBtn");
  if (loadAdminConsoleModeStatusBtn) loadAdminConsoleModeStatusBtn.addEventListener("click", loadAdminConsoleModeStatus);
  if (loadAdminConsoleModeChecklistBtn) loadAdminConsoleModeChecklistBtn.addEventListener("click", loadAdminConsoleModeChecklist);
  if (runAdminConsoleModeTestBtn) runAdminConsoleModeTestBtn.addEventListener("click", runAdminConsoleModeTest);
  if (applyConsoleModeUiBtn) applyConsoleModeUiBtn.addEventListener("click", () => applyAdminConsoleModeUi());
  if (loadBackupStatusBtn) loadBackupStatusBtn.addEventListener("click", loadBackupStatus);
  if (loadBackupChecklistBtn) loadBackupChecklistBtn.addEventListener("click", loadBackupChecklist);
  if (runBackupStatusTestBtn) runBackupStatusTestBtn.addEventListener("click", runBackupStatusTest);
  if (runManualBackupBtn) runManualBackupBtn.addEventListener("click", runManualBackup);
  if (loadManualBackupChecklistBtn) loadManualBackupChecklistBtn.addEventListener("click", loadManualBackupChecklist);
  if (runManualBackupTestBtn) runManualBackupTestBtn.addEventListener("click", runManualBackupTest);
  if (loadBackupHistoryBtn) loadBackupHistoryBtn.addEventListener("click", loadBackupHistory);
  if (loadBackupHistoryStatsBtn) loadBackupHistoryStatsBtn.addEventListener("click", loadBackupHistoryStats);
  if (syncBackupFilesHistoryBtn) syncBackupFilesHistoryBtn.addEventListener("click", syncBackupFilesHistory);
  if (loadBackupHistoryChecklistBtn) loadBackupHistoryChecklistBtn.addEventListener("click", loadBackupHistoryChecklist);
  if (runBackupHistoryTestBtn) runBackupHistoryTestBtn.addEventListener("click", runBackupHistoryTest);
  if (loadRestoreReadinessBtn) loadRestoreReadinessBtn.addEventListener("click", loadRestoreReadiness);
  if (loadRestoreReadinessChecklistBtn) loadRestoreReadinessChecklistBtn.addEventListener("click", loadRestoreReadinessChecklist);
  if (runRestoreReadinessTestBtn) runRestoreReadinessTestBtn.addEventListener("click", runRestoreReadinessTest);
  if (loadSystemMonitoringBtn) loadSystemMonitoringBtn.addEventListener("click", loadSystemMonitoringDashboard);
  if (loadSystemMonitoringChecklistBtn) loadSystemMonitoringChecklistBtn.addEventListener("click", loadSystemMonitoringChecklist);
  if (runSystemMonitoringTestBtn) runSystemMonitoringTestBtn.addEventListener("click", runSystemMonitoringTest);
  if (document.getElementById("loadResourceMonitoringBtn")) document.getElementById("loadResourceMonitoringBtn").addEventListener("click", loadResourceMonitoring);
  if (document.getElementById("loadWorkerMonitoringBtn")) document.getElementById("loadWorkerMonitoringBtn").addEventListener("click", loadWorkerMonitoring);
  if (document.getElementById("loadResourceMonitoringChecklistBtn")) document.getElementById("loadResourceMonitoringChecklistBtn").addEventListener("click", loadResourceMonitoringChecklist);
  if (document.getElementById("runResourceMonitoringTestBtn")) document.getElementById("runResourceMonitoringTestBtn").addEventListener("click", runResourceMonitoringTest);
  if (document.getElementById("loadAlertRulesStatusBtn")) document.getElementById("loadAlertRulesStatusBtn").addEventListener("click", loadAlertRulesStatus);
  if (document.getElementById("loadAlertRulesCatalogBtn")) document.getElementById("loadAlertRulesCatalogBtn").addEventListener("click", loadAlertRulesCatalog);
  if (document.getElementById("loadAlertRulesChecklistBtn")) document.getElementById("loadAlertRulesChecklistBtn").addEventListener("click", loadAlertRulesChecklist);
  if (document.getElementById("runAlertRulesTestBtn")) document.getElementById("runAlertRulesTestBtn").addEventListener("click", runAlertRulesTest);
  if (dangerousActionKey) dangerousActionKey.addEventListener("change", syncDangerousConfirmInputs);
  if (runContextRebuildBtn) runContextRebuildBtn.addEventListener("click", runContextRebuild);
  if (clearContextRebuildBtn) clearContextRebuildBtn.addEventListener("click", clearContextRebuildForm);

  loadDashboard();
  loadDailyHealthCheck();
  loadDailyHealthHistory();
  loadOperationChecklist();
  loadAutomationConfig();
  loadAutomationHistory();
  loadAutomationSafetyStatus();
  loadOperationLogs();
  loadOperationReportSummary();
  loadPhase9FinalChecklist();
  loadSummaryWorkerStatus();
  loadModelProviders();
  loadNormalizedModelProfiles();
  loadOpenAiLiveStatus();
  loadAnthropicLiveStatus();
  loadGeminiLiveStatus();
  loadProviderRouterStatus();
  loadFallbackScenarios();
  loadPhase11CompletionChecklist();
  loadAdminSecurityStatus();
  loadAdminPermissionStatus();
  loadDangerousActionStatus();
  loadApiErrorStandardStatus();
  loadEnvConfigStatus();
  loadDeploymentStatus();
  loadAdminConsoleModeStatus();
  loadBackupStatus();
  loadSystemMonitoringDashboard();
  loadAlertRulesStatus();
});

// Phase 14-4 Operator Manual helpers restored after snippet overwrite incident.
async function loadPhase14OperatorManualStatus() {
  const data = await AdminAPI.get('/ai/system/phase14-operator-manual/status');
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value == null ? '-' : String(value); };
  set('phase14OperatorManualStatus', data.status || '-');
  set('phase14OperatorManualFile', data.manual?.exists ? data.manual.file_name : 'missing');
  const out = document.getElementById('phase14OperatorManualOutput');
  if (out) out.textContent = JSON.stringify(data, null, 2);
}
async function loadPhase14OperatorManualChecklist() {
  const data = await AdminAPI.get('/ai/system/phase14-operator-manual/checklist');
  const out = document.getElementById('phase14OperatorManualChecklistOutput');
  if (out) out.textContent = JSON.stringify(data.checklist || data, null, 2);
}
async function runPhase14OperatorManualTest() {
  const data = await AdminAPI.post('/ai/system/phase14-operator-manual/test', {});
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value == null ? '-' : String(value); };
  set('phase14OperatorManualStatus', data.test_status || '-');
  set('phase14OperatorManualEntry', data.phase14_5_entry_allowed ? 'ALLOWED' : 'BLOCKED');
  const out = document.getElementById('phase14OperatorManualOutput');
  if (out) out.textContent = JSON.stringify(data, null, 2);
}

// ======================================================
// Phase 14-5 Server & Worker Runbook helpers
// ======================================================
function phase14RunbookSetText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value == null ? '-' : String(value);
}

function phase14RunbookSetJson(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = JSON.stringify(value || {}, null, 2);
}

function renderPhase14RunbookCommands(commands) {
  const body = document.getElementById('phase14RunbookCommandsBody');
  if (!body) return;
  if (!Array.isArray(commands) || commands.length === 0) {
    body.innerHTML = '<tr><td colspan="2">No commands loaded.</td></tr>';
    return;
  }
  body.innerHTML = commands.map((item) => `
    <tr>
      <td>${item.label || item.key || '-'}</td>
      <td><code>${item.command || '-'}</code></td>
    </tr>
  `).join('');
}

function renderPhase14RunbookChecklist(checklist) {
  const body = document.getElementById('phase14RunbookChecklistBody');
  if (!body) return;
  if (!Array.isArray(checklist) || checklist.length === 0) {
    body.innerHTML = '<tr><td colspan="4">No checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = checklist.map((item) => `
    <tr>
      <td>${item.group || '-'}</td>
      <td>${item.label || item.key || '-'}</td>
      <td>${item.required ? 'YES' : 'NO'}</td>
      <td><strong>${item.status || '-'}</strong></td>
    </tr>
  `).join('');
}

function renderPhase14Runbook(data) {
  const status = data.status || data.test_status || '-';
  phase14RunbookSetText('phase14RunbookStatus', status);
  phase14RunbookSetText('phase14RunbookFile', data.runbook?.exists || data.status?.runbook?.exists ? 'READY' : 'missing');
  phase14RunbookSetText('phase14RunbookEntry', data.phase14_6_entry_allowed === true ? 'ALLOWED' : data.phase14_6_entry_allowed === false ? 'BLOCKED' : '-');
  phase14RunbookSetText('phase14RunbookFailedCount', data.failed_items?.length ?? data.checklist_summary?.failed ?? '-');
  phase14RunbookSetText('phase14RunbookInfo', `Phase 14-5 Runbook loaded. Status: ${status}`);
  renderPhase14RunbookCommands(data.commands || data.status?.commands || []);
  renderPhase14RunbookChecklist(data.checklist || data.failed_items || []);
  phase14RunbookSetJson('phase14RunbookOutput', data);
}

async function loadPhase14RunbookStatus() {
  phase14RunbookSetText('phase14RunbookInfo', 'Loading Phase 14-5 runbook status...');
  const data = await AdminAPI.get('/ai/system/phase14-runbook/status');
  renderPhase14Runbook(data);
}

async function loadPhase14RunbookChecklist() {
  phase14RunbookSetText('phase14RunbookInfo', 'Loading Phase 14-5 runbook checklist...');
  const data = await AdminAPI.get('/ai/system/phase14-runbook/checklist');
  renderPhase14Runbook(data);
}

async function runPhase14RunbookTest() {
  phase14RunbookSetText('phase14RunbookInfo', 'Running Phase 14-5 runbook test...');
  const data = await AdminAPI.post('/ai/system/phase14-runbook/test', {});
  renderPhase14Runbook(data);
}

// ======================================================
// Phase 14-6 Final Deployment Checklist helpers
// ======================================================
function phase14FinalDeploymentSetText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value == null ? '-' : String(value);
}

function phase14FinalDeploymentSetJson(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = JSON.stringify(value || {}, null, 2);
}

function renderPhase14FinalDeploymentCommands(commands) {
  const body = document.getElementById('phase14FinalDeploymentCommandsBody');
  if (!body) return;
  if (!Array.isArray(commands) || commands.length === 0) {
    body.innerHTML = '<tr><td colspan="3">No commands loaded.</td></tr>';
    return;
  }
  body.innerHTML = commands.map((item) => `<tr><td>${item.label || item.key || '-'}</td><td><code>${item.command || '-'}</code></td><td>${item.purpose || '-'}</td></tr>`).join('');
}

function renderPhase14FinalDeploymentDocs(documents) {
  const body = document.getElementById('phase14FinalDeploymentDocsBody');
  if (!body) return;
  if (!Array.isArray(documents) || documents.length === 0) {
    body.innerHTML = '<tr><td colspan="3">No documents loaded.</td></tr>';
    return;
  }
  body.innerHTML = documents.map((item) => `<tr><td>${item.file_name || '-'}</td><td><strong>${item.exists ? 'YES' : 'NO'}</strong></td><td>${item.size_bytes || 0} bytes</td></tr>`).join('');
}

function renderPhase14FinalDeploymentChecklist(checklist) {
  const body = document.getElementById('phase14FinalDeploymentChecklistBody');
  if (!body) return;
  if (!Array.isArray(checklist) || checklist.length === 0) {
    body.innerHTML = '<tr><td colspan="4">No checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = checklist.map((item) => `<tr><td>${item.group || '-'}</td><td>${item.label || item.key || '-'}</td><td>${item.required ? 'YES' : 'NO'}</td><td><strong>${item.status || '-'}</strong></td></tr>`).join('');
}

function renderPhase14FinalDeployment(data) {
  const status = data.status || data.test_status || data.summary?.deployment_status || '-';
  const summary = data.summary || data.status?.summary || {};
  phase14FinalDeploymentSetText('phase14FinalDeploymentStatus', status);
  phase14FinalDeploymentSetText('phase14FinalDeploymentEntry', data.phase14_7_entry_allowed === true ? 'ALLOWED' : data.phase14_7_entry_allowed === false ? 'BLOCKED' : '-');
  phase14FinalDeploymentSetText('phase14FinalDeploymentRequired', summary.required ?? '-');
  phase14FinalDeploymentSetText('phase14FinalDeploymentFailed', summary.failed ?? (data.failed_items?.length ?? '-'));
  phase14FinalDeploymentSetText('phase14FinalDeploymentManual', summary.manual_check_items ?? (data.manual_check_items?.length ?? '-'));
  phase14FinalDeploymentSetText('phase14FinalDeploymentInfo', `Phase 14-6 deployment checklist loaded. Status: ${status}`);
  renderPhase14FinalDeploymentCommands(data.commands || data.status?.commands || []);
  renderPhase14FinalDeploymentDocs(data.documents || data.status?.documents || []);
  renderPhase14FinalDeploymentChecklist(data.checklist || data.failed_items || []);
  phase14FinalDeploymentSetJson('phase14FinalDeploymentOutput', data);
}

async function loadPhase14FinalDeploymentStatus() {
  phase14FinalDeploymentSetText('phase14FinalDeploymentInfo', 'Loading Phase 14-6 deployment status...');
  const data = await AdminAPI.get('/ai/system/phase14-final-deployment/status');
  renderPhase14FinalDeployment(data);
}

async function loadPhase14FinalDeploymentChecklist() {
  phase14FinalDeploymentSetText('phase14FinalDeploymentInfo', 'Loading Phase 14-6 deployment checklist...');
  const data = await AdminAPI.get('/ai/system/phase14-final-deployment/checklist');
  renderPhase14FinalDeployment(data);
}

async function runPhase14FinalDeploymentTest() {
  phase14FinalDeploymentSetText('phase14FinalDeploymentInfo', 'Running Phase 14-6 deployment test...');
  const data = await AdminAPI.post('/ai/system/phase14-final-deployment/test', {});
  renderPhase14FinalDeployment(data);
}


// ======================================================
// Phase 14-7: Project Completion Report
// ======================================================
function phase14ProjectCompletionSetText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value == null ? '-' : String(value);
}

function phase14ProjectCompletionSetJson(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = JSON.stringify(value, null, 2);
}

function renderPhase14ProjectCompletionPhases(phases) {
  const body = document.getElementById('phase14ProjectCompletionPhaseBody');
  if (!body) return;
  if (!Array.isArray(phases) || phases.length === 0) {
    body.innerHTML = '<tr><td colspan="3">No phase summary loaded.</td></tr>';
    return;
  }
  body.innerHTML = phases.map((item) => `<tr><td>${item.phase || '-'}</td><td>${item.title || '-'}</td><td><strong>${item.status || '-'}</strong></td></tr>`).join('');
}

function renderPhase14ProjectCompletionDocs(docs) {
  const body = document.getElementById('phase14ProjectCompletionDocsBody');
  if (!body) return;
  if (!Array.isArray(docs) || docs.length === 0) {
    body.innerHTML = '<tr><td colspan="3">No documents loaded.</td></tr>';
    return;
  }
  body.innerHTML = docs.map((doc) => `<tr><td>${doc.file_name || '-'}</td><td>${doc.exists ? 'YES' : 'NO'}</td><td>${doc.size_bytes || 0} bytes</td></tr>`).join('');
}

function renderPhase14ProjectCompletionChecklist(checklist) {
  const body = document.getElementById('phase14ProjectCompletionChecklistBody');
  if (!body) return;
  if (!Array.isArray(checklist) || checklist.length === 0) {
    body.innerHTML = '<tr><td colspan="4">No checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = checklist.map((item) => `<tr><td>${item.group || '-'}</td><td>${item.label || item.key || '-'}</td><td>${item.required ? 'YES' : 'NO'}</td><td><strong>${item.status || '-'}</strong></td></tr>`).join('');
}

function renderPhase14ProjectCompletion(data) {
  const status = data.status || data.test_status || data.status?.status || '-';
  const summary = data.summary || data.status?.summary || {};
  const source = data.status && data.status.summary ? data.status : data;
  phase14ProjectCompletionSetText('phase14ProjectCompletionStatus', source.status || status);
  phase14ProjectCompletionSetText('phase14ProjectCompletionEntry', source.phase14_final_entry_allowed === true || data.phase14_final_entry_allowed === true ? 'ALLOWED' : 'BLOCKED');
  phase14ProjectCompletionSetText('phase14ProjectCompletionPhaseCount', summary.completed_phase_count ?? source.summary?.completed_phase_count ?? '-');
  phase14ProjectCompletionSetText('phase14ProjectCompletionRequired', summary.required_items ?? source.summary?.required_items ?? '-');
  phase14ProjectCompletionSetText('phase14ProjectCompletionFailed', summary.failed_items ?? source.summary?.failed_items ?? (data.failed_items?.length ?? '-'));
  phase14ProjectCompletionSetText('phase14ProjectCompletionMissingDocs', summary.missing_document_count ?? source.summary?.missing_document_count ?? '-');
  phase14ProjectCompletionSetText('phase14ProjectCompletionInfo', `Phase 14-7 completion report loaded. Status: ${source.status || status}`);
  renderPhase14ProjectCompletionPhases(source.completed_phases || data.completed_phases || []);
  renderPhase14ProjectCompletionDocs(source.documents || data.documents || []);
  renderPhase14ProjectCompletionChecklist(source.checklist || data.checklist || data.failed_items || []);
  phase14ProjectCompletionSetJson('phase14ProjectCompletionOutput', data);
}

async function loadPhase14ProjectCompletionStatus() {
  phase14ProjectCompletionSetText('phase14ProjectCompletionInfo', 'Loading Phase 14-7 completion report status...');
  const data = await AdminAPI.get('/ai/system/phase14-project-completion/status');
  renderPhase14ProjectCompletion(data);
}

async function loadPhase14ProjectCompletionChecklist() {
  phase14ProjectCompletionSetText('phase14ProjectCompletionInfo', 'Loading Phase 14-7 completion checklist...');
  const data = await AdminAPI.get('/ai/system/phase14-project-completion/checklist');
  renderPhase14ProjectCompletion(data);
}

async function runPhase14ProjectCompletionTest() {
  phase14ProjectCompletionSetText('phase14ProjectCompletionInfo', 'Running Phase 14-7 completion report test...');
  const data = await AdminAPI.post('/ai/system/phase14-project-completion/test', {});
  renderPhase14ProjectCompletion(data);
}

// ======================================================
// Phase 14 Final: AI Memory Gateway v1 Completion Decision
// ======================================================
function phase14FinalSetText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? '-';
}

function phase14FinalSetJson(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = JSON.stringify(value || {}, null, 2);
}

function renderPhase14FinalScope(rows) {
  const body = document.getElementById('phase14FinalScopeBody');
  if (!body) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="3">No completed scope loaded.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.phase || '-'}</td>
      <td>${row.title || '-'}</td>
      <td>${statusBadge(row.status || '-')}</td>
    </tr>
  `).join('');
}

function renderPhase14FinalDocs(rows) {
  const body = document.getElementById('phase14FinalDocsBody');
  if (!body) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="3">No final documents loaded.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.file_name || '-'}</td>
      <td>${row.exists ? statusBadge('YES') : statusBadge('NO')}</td>
      <td>${row.size_human || row.size_bytes || '-'}</td>
    </tr>
  `).join('');
}

function renderPhase14FinalChecklist(rows) {
  const body = document.getElementById('phase14FinalChecklistBody');
  if (!body) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="4">No Phase 14 Final checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.group || '-'}</td>
      <td>${row.label || row.key || '-'}</td>
      <td>${row.required ? 'YES' : 'NO'}</td>
      <td>${statusBadge(row.status || '-')}</td>
    </tr>
  `).join('');
}

function renderPhase14Final(data) {
  const report = data.report || data;
  phase14FinalSetText('phase14FinalDecisionStatus', data.decision_status || report.checklist_status || '-');
  phase14FinalSetText('phase14FinalStatus', data.final_status || report.checklist_status || '-');
  phase14FinalSetText('phase14FinalCompleted', data.ai_memory_gateway_v1_completed === true ? 'YES' : (data.ai_memory_gateway_v1_completed === false ? 'NO' : '-'));
  phase14FinalSetText('phase14FinalCompletionPercent', `${data.completion_percent ?? report.completion_percent ?? '-'}%`);
  phase14FinalSetText('phase14FinalBlockingCount', (data.blocking_items || report.missing_documents || []).length ?? '-');
  phase14FinalSetText('phase14FinalManualCount', (data.manual_check_items || []).length ?? report.warning_count ?? '-');

  renderPhase14FinalScope(data.completed_scope || report.phase_summary || []);
  renderPhase14FinalDocs(report.documents || []);
  renderPhase14FinalChecklist(report.checklist || []);
  phase14FinalSetJson('phase14FinalNextActions', data.recommended_next_actions || []);
  phase14FinalSetJson('phase14FinalOutput', data);
}

async function loadPhase14FinalChecklist() {
  phase14FinalSetText('phase14FinalInfo', 'Loading Phase 14 Final checklist...');
  try {
    const data = await AdminAPI.get('/ai/system/phase14-final-checklist');
    renderPhase14Final(data);
    phase14FinalSetText('phase14FinalInfo', `Phase 14 Final checklist loaded at ${nowText()}`);
  } catch (error) {
    phase14FinalSetText('phase14FinalInfo', `Error: ${error.message}`);
    phase14FinalSetJson('phase14FinalOutput', { ok: false, error: error.message });
  }
}

async function runPhase14FinalDecision() {
  phase14FinalSetText('phase14FinalInfo', 'Running Phase 14 Final completion decision...');
  try {
    const data = await AdminAPI.post('/ai/system/phase14-final-decision', {});
    renderPhase14Final(data);
    phase14FinalSetText('phase14FinalInfo', `Phase 14 Final decision completed at ${nowText()}`);
  } catch (error) {
    phase14FinalSetText('phase14FinalInfo', `Error: ${error.message}`);
    phase14FinalSetJson('phase14FinalOutput', { ok: false, error: error.message });
  }
}

async function runPhase14FinalTest() {
  phase14FinalSetText('phase14FinalInfo', 'Running Phase 14 Final test...');
  try {
    const data = await AdminAPI.post('/ai/system/phase14-final-test', {});
    renderPhase14Final(data);
    phase14FinalSetText('phase14FinalInfo', `Phase 14 Final test completed at ${nowText()}`);
  } catch (error) {
    phase14FinalSetText('phase14FinalInfo', `Error: ${error.message}`);
    phase14FinalSetJson('phase14FinalOutput', { ok: false, error: error.message });
  }
}

// ======================================================
// Phase 15-1: Imported Conversation Storage UI
// ======================================================
function renderImportedConversationChecklist(items) {
  const body = document.getElementById("importedConversationChecklistBody");
  if (!body) return;
  if (!items || !items.length) {
    body.innerHTML = '<tr><td colspan="4">No checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.group || "-")}</td>
      <td class="wrap-cell">${escapeHtml(item.label || item.key || "-")}</td>
      <td>${statusBadge(item.status || "-")}</td>
      <td>${item.required ? "YES" : "NO"}</td>
    </tr>
  `).join("");
}

function renderImportedConversationStatus(data) {
  setText("importStorageStatus", data.storage_status || data.checklist_status || data.test_status || "-");
  setText("importBatchCount", data.counts?.batches ?? data.status?.counts?.batches ?? "-");
  setText("importConversationCount", data.counts?.conversations ?? data.status?.counts?.conversations ?? "-");
  setText("importMessageCount", data.counts?.messages ?? data.status?.counts?.messages ?? "-");
  setText("importedConversationInfo", `Phase 15-1 import storage loaded at ${nowText()}`);
  renderImportedConversationChecklist(data.checklist || data.status?.checklist || []);
  setText("importedConversationOutput", JSON.stringify(data, null, 2));
}

async function loadImportedConversationStatus() {
  setText("importedConversationInfo", "Loading imported conversation storage status...");
  const data = await AdminAPI.get("/ai/imports/conversations/status");
  renderImportedConversationStatus(data);
}

async function loadImportedConversationChecklist() {
  setText("importedConversationInfo", "Loading imported conversation checklist...");
  const data = await AdminAPI.get("/ai/imports/conversations/checklist");
  renderImportedConversationStatus(data);
}

async function runImportedConversationStorageTest(insertRecord = false) {
  setText("importedConversationInfo", insertRecord ? "Inserting Phase 15-1 test record..." : "Running Phase 15-1 storage test...");
  const payload = insertRecord ? { scenario: "insert_test_record", project_code: "rbs_ai_memory" } : { scenario: "current" };
  const data = await AdminAPI.post("/ai/imports/conversations/test", payload);
  renderImportedConversationStatus(data);
}

document.addEventListener("click", (event) => {
  const id = event.target?.id;
  if (id === "loadImportedConversationStatusBtn") {
    loadImportedConversationStatus().catch((error) => {
      setText("importedConversationInfo", `Load failed: ${error.message}`);
      setText("importedConversationOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "loadImportedConversationChecklistBtn") {
    loadImportedConversationChecklist().catch((error) => {
      setText("importedConversationInfo", `Checklist failed: ${error.message}`);
      setText("importedConversationOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "runImportedConversationTestBtn") {
    runImportedConversationStorageTest(false).catch((error) => {
      setText("importedConversationInfo", `Test failed: ${error.message}`);
      setText("importedConversationOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "insertImportedConversationTestRecordBtn") {
    runImportedConversationStorageTest(true).catch((error) => {
      setText("importedConversationInfo", `Insert test record failed: ${error.message}`);
      setText("importedConversationOutput", JSON.stringify(error, null, 2));
    });
  }
});


// ======================================================
// Phase 15-2: ChatGPT Export ZIP Importer UI
// ======================================================
function renderChatGPTImporterChecklist(items) {
  const body = document.getElementById("chatgptImporterChecklistBody");
  if (!body) return;
  if (!items || !items.length) {
    body.innerHTML = '<tr><td colspan="4">No checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.group || "-")}</td>
      <td class="wrap-cell">${escapeHtml(item.label || item.key || "-")}${item.install_command ? `<br><code>${escapeHtml(item.install_command)}</code>` : ""}</td>
      <td>${statusBadge(item.status || "-")}</td>
      <td>${item.required ? "YES" : "NO"}</td>
    </tr>
  `).join("");
}

function renderChatGPTImporterStatus(data) {
  const status = data.importer_status || data.checklist_status || data.import_status || data.test_status || data.status?.importer_status || "-";
  setText("chatgptImporterStatus", status);
  setText("chatgptAdmZipStatus", data.dependency?.available === true || data.importer_status?.dependency?.available === true ? "READY" : (data.dependency?.available === false ? "MISSING" : "-"));
  const latestBatch = data.latest_chatgpt_batch || data.status?.latest_chatgpt_batch || data.importer_status?.latest_chatgpt_batch;
  setText("chatgptLatestBatch", latestBatch?.batch_code || data.batch_code || "-");
  setText("chatgptImportedCount", data.imported_conversations ?? latestBatch?.imported_conversations ?? "-");
  setText("chatgptImporterInfo", `Phase 15-2 ChatGPT importer loaded at ${nowText()}`);
  renderChatGPTImporterChecklist(data.checklist || data.importer_status?.checklist || data.status?.checklist || []);
  setText("chatgptImporterOutput", JSON.stringify(data, null, 2));
}

async function loadChatGPTImporterStatus() {
  setText("chatgptImporterInfo", "Loading ChatGPT importer status...");
  const data = await AdminAPI.get("/ai/imports/chatgpt/status");
  renderChatGPTImporterStatus(data);
}

async function loadChatGPTImporterChecklist() {
  setText("chatgptImporterInfo", "Loading ChatGPT importer checklist...");
  const data = await AdminAPI.get("/ai/imports/chatgpt/checklist");
  renderChatGPTImporterStatus(data);
}

async function runChatGPTImporterTest() {
  setText("chatgptImporterInfo", "Running ChatGPT parser test...");
  const data = await AdminAPI.post("/ai/imports/chatgpt/test", { scenario: "synthetic_parser" });
  renderChatGPTImporterStatus(data);
}

async function runChatGPTZipImport() {
  const zipPath = document.getElementById("chatgptZipFilePath")?.value || "";
  const projectCode = document.getElementById("chatgptImportProjectCode")?.value || "rbs_ai_memory";
  const limitValue = Number(document.getElementById("chatgptImportLimit")?.value || 0);
  if (!zipPath.trim()) {
    setText("chatgptImporterInfo", "ZIP file path is required.");
    return;
  }
  setText("chatgptImporterInfo", "Importing ChatGPT export ZIP. Please wait...");
  const data = await AdminAPI.post("/ai/imports/chatgpt/import", {
    zip_file_path: zipPath.trim(),
    project_code: projectCode.trim() || "rbs_ai_memory",
    limit: limitValue,
    skip_duplicates: true
  });
  renderChatGPTImporterStatus(data);
}

document.addEventListener("click", (event) => {
  const id = event.target?.id;
  if (id === "loadChatGPTImporterStatusBtn") {
    loadChatGPTImporterStatus().catch((error) => {
      setText("chatgptImporterInfo", `Load failed: ${error.message}`);
      setText("chatgptImporterOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "loadChatGPTImporterChecklistBtn") {
    loadChatGPTImporterChecklist().catch((error) => {
      setText("chatgptImporterInfo", `Checklist failed: ${error.message}`);
      setText("chatgptImporterOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "runChatGPTImporterTestBtn") {
    runChatGPTImporterTest().catch((error) => {
      setText("chatgptImporterInfo", `Parser test failed: ${error.message}`);
      setText("chatgptImporterOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "runChatGPTZipImportBtn") {
    runChatGPTZipImport().catch((error) => {
      setText("chatgptImporterInfo", `ZIP import failed: ${error.message}`);
      setText("chatgptImporterOutput", JSON.stringify(error, null, 2));
    });
  }
});

// ======================================================
// Phase 15-3: Imported Conversation -> Summary Queue UI
// ======================================================
function renderSummaryQueueLinkChecklist(items) {
  const body = document.getElementById("summaryQueueLinkChecklistBody");
  if (!body) return;
  if (!items || !items.length) {
    body.innerHTML = '<tr><td colspan="4">No checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.group || "-")}</td>
      <td class="wrap-cell">${escapeHtml(item.label || item.key || "-")}</td>
      <td>${statusBadge(item.status || "-")}</td>
      <td>${item.required ? "YES" : "NO"}</td>
    </tr>
  `).join("");
}

function renderSummaryQueueLinkStatus(data) {
  const status = data.link_status || data.checklist_status || data.test_status || data.status?.link_status || "-";
  const counts = data.counts || data.status?.counts || {};
  setText("summaryQueueLinkStatus", status);
  setText("summaryQueueEligibleCount", counts.eligible_for_queue ?? "-");
  setText("summaryQueueQueuedCount", counts.queued_imports ?? data.queued_count ?? "-");
  setText("summaryQueuePendingCount", counts.pending_summary_queue ?? "-");
  setText("summaryQueueLinkInfo", `Phase 15-3 summary queue link loaded at ${nowText()}`);
  renderSummaryQueueLinkChecklist(data.checklist || data.status?.checklist || []);
  setText("summaryQueueLinkOutput", JSON.stringify(data, null, 2));
}

async function loadSummaryQueueLinkStatus() {
  setText("summaryQueueLinkInfo", "Loading summary queue link status...");
  const data = await AdminAPI.get("/ai/imports/summary-queue-link/status");
  renderSummaryQueueLinkStatus(data);
}

async function loadSummaryQueueLinkChecklist() {
  setText("summaryQueueLinkInfo", "Loading summary queue link checklist...");
  const data = await AdminAPI.get("/ai/imports/summary-queue-link/checklist");
  renderSummaryQueueLinkStatus(data);
}

async function runSummaryQueueLinkTest() {
  setText("summaryQueueLinkInfo", "Running summary queue link test...");
  const data = await AdminAPI.post("/ai/imports/summary-queue-link/test", { scenario: "current" });
  renderSummaryQueueLinkStatus(data);
}

async function queueImportedConversations() {
  const projectCode = document.getElementById("summaryQueueLinkProjectCode")?.value || "rbs_ai_memory";
  const limitValue = Number(document.getElementById("summaryQueueLinkLimit")?.value || 3);
  const model = document.getElementById("summaryQueueLinkModel")?.value || "gpt-4o-mini";
  setText("summaryQueueLinkInfo", "Queueing imported conversations for summary...");
  const data = await AdminAPI.post("/ai/imports/summary-queue-link/queue", {
    project_code: projectCode.trim() || "rbs_ai_memory",
    limit: limitValue,
    summary_model: model.trim() || "gpt-4o-mini"
  });
  renderSummaryQueueLinkStatus(data);
}

document.addEventListener("click", (event) => {
  const id = event.target?.id;
  if (id === "loadSummaryQueueLinkStatusBtn") {
    loadSummaryQueueLinkStatus().catch((error) => {
      setText("summaryQueueLinkInfo", `Load failed: ${error.message}`);
      setText("summaryQueueLinkOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "loadSummaryQueueLinkChecklistBtn") {
    loadSummaryQueueLinkChecklist().catch((error) => {
      setText("summaryQueueLinkInfo", `Checklist failed: ${error.message}`);
      setText("summaryQueueLinkOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "runSummaryQueueLinkTestBtn") {
    runSummaryQueueLinkTest().catch((error) => {
      setText("summaryQueueLinkInfo", `Test failed: ${error.message}`);
      setText("summaryQueueLinkOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "queueImportedConversationsBtn") {
    queueImportedConversations().catch((error) => {
      setText("summaryQueueLinkInfo", `Queue failed: ${error.message}`);
      setText("summaryQueueLinkOutput", JSON.stringify(error, null, 2));
    });
  }
});


// ======================================================
// Phase 15-4: Import Memory Search UI
// ======================================================
function renderImportMemorySearchChecklist(items) {
  const body = document.getElementById("importMemorySearchChecklistBody");
  if (!body) return;
  if (!items || !items.length) {
    body.innerHTML = '<tr><td colspan="4">No checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.group || "-")}</td>
      <td class="wrap-cell">${escapeHtml(item.label || item.key || "-")}</td>
      <td>${statusBadge(item.status || "-")}</td>
      <td>${item.required ? "YES" : "NO"}</td>
    </tr>
  `).join("");
}

function renderImportMemorySearchResults(results) {
  const body = document.getElementById("importMemorySearchResultsBody");
  if (!body) return;
  if (!results || !results.length) {
    body.innerHTML = '<tr><td colspan="8">No results found.</td></tr>';
    return;
  }
  body.innerHTML = results.map((item) => `
    <tr>
      <td>${escapeHtml(item.id || "-")}</td>
      <td>${escapeHtml(item.project_code || "-")}</td>
      <td>${escapeHtml(item.source_platform || "-")}</td>
      <td class="wrap-cell"><strong>${escapeHtml(item.title || "Untitled")}</strong><br><small>${escapeHtml((item.preview_text || "").slice(0, 180))}</small></td>
      <td>${escapeHtml(item.stored_message_count ?? item.message_count ?? "-")}</td>
      <td>${item.summary_queue_id ? escapeHtml(item.summary_queue_id) : "-"}</td>
      <td>${item.memory_id ? escapeHtml(item.memory_id) : "-"}</td>
      <td>${escapeHtml(item.imported_at || "-")}</td>
    </tr>
  `).join("");
}

function renderImportMemorySearchStatus(data) {
  const status = data.search_status || data.checklist_status || data.test_status || data.status?.search_status || "-";
  const counts = data.counts || data.status?.counts || data.sample_search?.status?.counts || {};
  setText("importMemorySearchStatus", status);
  setText("importMemoryImportedCount", counts.imported_conversations ?? "-");
  setText("importMemoryQueuedCount", counts.queued_imports ?? "-");
  setText("importMemoryCompletedCount", counts.completed_imports ?? "-");
  setText("importMemorySearchInfo", `Phase 15-4 import memory search loaded at ${nowText()}`);
  renderImportMemorySearchChecklist(data.checklist || data.status?.checklist || []);
  renderImportMemorySearchResults(data.results || data.sample_search?.results || []);
  setText("importMemorySearchOutput", JSON.stringify(data, null, 2));
}

async function loadImportMemorySearchStatus() {
  setText("importMemorySearchInfo", "Loading import memory search status...");
  const data = await AdminAPI.get("/ai/imports/memory-search/status");
  renderImportMemorySearchStatus(data);
}

async function loadImportMemorySearchChecklist() {
  setText("importMemorySearchInfo", "Loading import memory search checklist...");
  const data = await AdminAPI.get("/ai/imports/memory-search/checklist");
  renderImportMemorySearchStatus(data);
}

async function runImportMemorySearchTest() {
  setText("importMemorySearchInfo", "Running import memory search test...");
  const data = await AdminAPI.post("/ai/imports/memory-search/test", { scenario: "current", limit: 5 });
  renderImportMemorySearchStatus(data);
}

async function runImportMemorySearch() {
  const projectCode = document.getElementById("importMemorySearchProjectCode")?.value || "rbs_ai_memory";
  const platform = document.getElementById("importMemorySearchPlatform")?.value || "chatgpt";
  const memoryStatus = document.getElementById("importMemorySearchMemoryStatus")?.value || "all";
  const keyword = document.getElementById("importMemorySearchKeyword")?.value || "";
  const limitValue = Number(document.getElementById("importMemorySearchLimit")?.value || 20);
  setText("importMemorySearchInfo", "Searching imported memory...");
  const data = await AdminAPI.post("/ai/imports/memory-search/search", {
    project_code: projectCode.trim(),
    source_platform: platform.trim(),
    memory_status: memoryStatus,
    keyword: keyword.trim(),
    limit: limitValue
  });
  renderImportMemorySearchStatus(data);
}

document.addEventListener("click", (event) => {
  const id = event.target?.id;
  if (id === "loadImportMemorySearchStatusBtn") {
    loadImportMemorySearchStatus().catch((error) => {
      setText("importMemorySearchInfo", `Load failed: ${error.message}`);
      setText("importMemorySearchOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "loadImportMemorySearchChecklistBtn") {
    loadImportMemorySearchChecklist().catch((error) => {
      setText("importMemorySearchInfo", `Checklist failed: ${error.message}`);
      setText("importMemorySearchOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "runImportMemorySearchTestBtn") {
    runImportMemorySearchTest().catch((error) => {
      setText("importMemorySearchInfo", `Test failed: ${error.message}`);
      setText("importMemorySearchOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "runImportMemorySearchBtn") {
    runImportMemorySearch().catch((error) => {
      setText("importMemorySearchInfo", `Search failed: ${error.message}`);
      setText("importMemorySearchOutput", JSON.stringify(error, null, 2));
    });
  }
});

// ======================================================
// Phase 15-5: Gemini / Claude Importer UI
// ======================================================
function renderGeminiClaudeChecklist(items) {
  const body = document.getElementById("geminiClaudeChecklistBody");
  if (!body) return;
  if (!items || !items.length) {
    body.innerHTML = '<tr><td colspan="4">No checklist loaded.</td></tr>';
    return;
  }
  body.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.group || "-")}</td>
      <td class="wrap-cell">${escapeHtml(item.label || item.key || "-")}</td>
      <td>${statusBadge(item.status || "-")}</td>
      <td>${item.required ? "YES" : "NO"}</td>
    </tr>
  `).join("");
}

function renderGeminiClaudeImporterStatus(data) {
  const status = data.importer_status || data.checklist_status || data.test_status || data.import_status || data.status?.importer_status || "-";
  const counts = data.counts || data.status?.counts || {};
  const dependency = data.dependency || data.status?.dependency || {};
  setText("geminiClaudeImporterStatus", status);
  setText("geminiImportCount", counts.gemini?.conversations ?? "-");
  setText("claudeImportCount", counts.claude?.conversations ?? "-");
  setText("geminiClaudeDependency", dependency.available === true ? "adm-zip OK" : dependency.available === false ? "ACTION" : "-");
  setText("geminiClaudeImporterInfo", `Phase 15-5 Gemini / Claude importer loaded at ${nowText()}`);
  renderGeminiClaudeChecklist(data.checklist || data.status?.checklist || []);
  setText("geminiClaudeImporterOutput", JSON.stringify(data, null, 2));
}

async function loadGeminiClaudeImporterStatus() {
  setText("geminiClaudeImporterInfo", "Loading Gemini / Claude importer status...");
  const data = await AdminAPI.get("/ai/imports/gemini-claude/status");
  renderGeminiClaudeImporterStatus(data);
}

async function loadGeminiClaudeImporterChecklist() {
  setText("geminiClaudeImporterInfo", "Loading Gemini / Claude importer checklist...");
  const data = await AdminAPI.get("/ai/imports/gemini-claude/checklist");
  renderGeminiClaudeImporterStatus(data);
}

async function runGeminiClaudeImporterTest(platform) {
  setText("geminiClaudeImporterInfo", `Running ${platform} parser test...`);
  const data = await AdminAPI.post("/ai/imports/gemini-claude/test", {
    scenario: "synthetic_parser",
    source_platform: platform
  });
  renderGeminiClaudeImporterStatus(data);
}

async function importGeminiClaudeExport() {
  const sourcePlatform = document.getElementById("geminiClaudeSourcePlatform")?.value || "gemini";
  const projectCode = document.getElementById("geminiClaudeProjectCode")?.value || "rbs_ai_memory";
  const filePath = document.getElementById("geminiClaudeFilePath")?.value || "";
  const limit = Number(document.getElementById("geminiClaudeImportLimit")?.value || 3);
  const skipDuplicates = (document.getElementById("geminiClaudeSkipDuplicates")?.value || "true") === "true";

  setText("geminiClaudeImporterInfo", `Importing ${sourcePlatform} export...`);
  const data = await AdminAPI.post("/ai/imports/gemini-claude/import", {
    source_platform: sourcePlatform,
    file_path: filePath.trim(),
    project_code: projectCode.trim(),
    skip_duplicates: skipDuplicates,
    limit
  });
  renderGeminiClaudeImporterStatus(data);
}

document.addEventListener("click", (event) => {
  const id = event.target?.id;
  if (id === "loadGeminiClaudeImporterStatusBtn") {
    loadGeminiClaudeImporterStatus().catch((error) => {
      setText("geminiClaudeImporterInfo", `Load failed: ${error.message}`);
      setText("geminiClaudeImporterOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "loadGeminiClaudeImporterChecklistBtn") {
    loadGeminiClaudeImporterChecklist().catch((error) => {
      setText("geminiClaudeImporterInfo", `Checklist failed: ${error.message}`);
      setText("geminiClaudeImporterOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "runGeminiImporterTestBtn") {
    runGeminiClaudeImporterTest("gemini").catch((error) => {
      setText("geminiClaudeImporterInfo", `Gemini parser test failed: ${error.message}`);
      setText("geminiClaudeImporterOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "runClaudeImporterTestBtn") {
    runGeminiClaudeImporterTest("claude").catch((error) => {
      setText("geminiClaudeImporterInfo", `Claude parser test failed: ${error.message}`);
      setText("geminiClaudeImporterOutput", JSON.stringify(error, null, 2));
    });
  }
  if (id === "importGeminiClaudeExportBtn") {
    importGeminiClaudeExport().catch((error) => {
      setText("geminiClaudeImporterInfo", `Import failed: ${error.message}`);
      setText("geminiClaudeImporterOutput", JSON.stringify(error, null, 2));
    });
  }
});
