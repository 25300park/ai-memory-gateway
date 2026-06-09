(function () {
  const CONFIRM_TEXT = "MANUAL_DB_BACKUP";

  function pretty(value) {
    return JSON.stringify(value || {}, null, 2);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function statusLabel(value) {
    return value ? "READY" : "NOT READY";
  }

  function renderPrecheck(data) {
    setText("manualBackupReady", statusLabel(data.ready));
    setText("manualBackupDir", data.backup_directory?.path || "-");
    setText("manualBackupDirWritable", data.backup_directory?.writable ? "YES" : "NO");
    setText("manualBackupDb", data.database?.name || "-");
    setText("manualBackupMysqlDump", data.mysqldump_bin || "mysqldump");
    setText("manualBackupPrecheckOutput", pretty(data));
  }

  function renderHistory(data) {
    const body = document.getElementById("manualBackupHistoryBody");
    if (!body) return;

    const rows = data.results || [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5">No manual backup history yet.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((item) => `
      <tr>
        <td>${item.status || "-"}</td>
        <td>${item.file_name || "-"}</td>
        <td>${item.file_size_human || "-"}</td>
        <td>${item.started_at || "-"}</td>
        <td>${item.error || item.mysqldump_warning || "-"}</td>
      </tr>
    `).join("");
  }

  async function loadManualBackupPrecheck() {
    try {
      setText("manualBackupResultOutput", "Loading manual backup precheck...");
      const data = await AdminAPI.get("/ai/backup/manual/precheck");
      renderPrecheck(data);
      setText("manualBackupResultOutput", "Manual backup precheck loaded.");
      return data;
    } catch (error) {
      setText("manualBackupResultOutput", `Manual backup precheck failed: ${error.message}`);
      throw error;
    }
  }

  async function loadManualBackupHistory() {
    try {
      const data = await AdminAPI.get("/ai/backup/manual/history?limit=20");
      renderHistory(data);
      return data;
    } catch (error) {
      const body = document.getElementById("manualBackupHistoryBody");
      if (body) body.innerHTML = `<tr><td colspan="5">History load failed: ${error.message}</td></tr>`;
      throw error;
    }
  }

  async function runManualBackup() {
    const typed = window.prompt(
      `Dangerous Action Confirmation\n\nType ${CONFIRM_TEXT} to run manual database backup.`
    );

    if (typed !== CONFIRM_TEXT) {
      setText("manualBackupResultOutput", "Manual backup cancelled: confirmation text did not match.");
      return;
    }

    const button = document.getElementById("runManualBackupBtn");
    if (button) {
      button.disabled = true;
      button.textContent = "Running Manual Backup...";
    }

    try {
      setText("manualBackupResultOutput", "Running mysqldump backup. Do not close the server while this is running.");
      const data = await AdminAPI.post("/ai/backup/manual/run", {
        confirm_action: CONFIRM_TEXT,
        confirm_text: CONFIRM_TEXT,
        requested_by: "admin-console"
      });

      setText("manualBackupResultOutput", pretty(data));
      await loadManualBackupPrecheck();
      await loadManualBackupHistory();

      if (typeof loadBackupStatus === "function") {
        await loadBackupStatus();
      }
    } catch (error) {
      setText("manualBackupResultOutput", `Manual backup failed: ${error.message}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Run Manual DB Backup";
      }
    }
  }

  function bindManualBackupEvents() {
    document.getElementById("loadManualBackupPrecheckBtn")?.addEventListener("click", loadManualBackupPrecheck);
    document.getElementById("loadManualBackupHistoryBtn")?.addEventListener("click", loadManualBackupHistory);
    document.getElementById("runManualBackupBtn")?.addEventListener("click", runManualBackup);

    if (document.getElementById("manualBackupPrecheckOutput")) {
      loadManualBackupPrecheck().catch(() => {});
      loadManualBackupHistory().catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindManualBackupEvents);
  } else {
    bindManualBackupEvents();
  }
})();
