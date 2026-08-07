const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

// Phase 22-2: 200-500 rows per multi-VALUES INSERT is the usual safe range against
// max_allowed_packet without needing to size batches by actual payload bytes - individual
// message content_text can be long (full assistant answers with code blocks), so this stays
// on the low end of that range rather than the high end.
const MESSAGE_BATCH_SIZE = Number(process.env.IMPORT_MESSAGE_BATCH_SIZE) || 250;

const MESSAGE_COLUMNS = [
  "imported_conversation_id", "batch_id", "source_platform", "source_message_id", "parent_message_id",
  "message_order", "role", "author_name", "content_type", "content_text", "raw_json", "token_estimate",
  "source_created_at"
];

function messageToRowValues({ message, importedConversationId, batchId, platform }) {
  return [
    importedConversationId,
    batchId,
    platform,
    message.source_message_id,
    message.parent_message_id,
    message.message_order,
    message.role,
    message.author_name,
    message.content_type,
    message.content_text,
    safeJson(message.raw_json),
    Math.ceil((message.content_text || "").length / 4),
    message.source_created_at
  ];
}

// Was one INSERT per message (Phase 15-5 original) - for a 6,800-message Claude export that
// meant 6,800 sequential round trips to Railway, ~54 minutes. Chunks into multi-row INSERTs
// instead; each chunk runs on its own connection inside a transaction, so a failure only
// rolls back the messages in that one chunk (the conversation row and any already-committed
// chunks stay intact) rather than the whole conversation or the whole import.
async function insertMessagesInBatches({ messages, importedConversationId, batchId, platform, progressLabel }) {
  if (!messages.length) return 0;

  let inserted = 0;
  for (let offset = 0; offset < messages.length; offset += MESSAGE_BATCH_SIZE) {
    const chunk = messages.slice(offset, offset + MESSAGE_BATCH_SIZE);
    const rowPlaceholder = `(${MESSAGE_COLUMNS.map(() => "?").join(", ")})`;
    const params = chunk.flatMap((message) => messageToRowValues({ message, importedConversationId, batchId, platform }));

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO imported_conversation_messages (${MESSAGE_COLUMNS.join(", ")}) VALUES ${chunk.map(() => rowPlaceholder).join(", ")}`,
        params
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    inserted += chunk.length;
    console.log(`[gemini-claude-importer] ${progressLabel}: ${inserted}/${messages.length} messages inserted`);
  }

  return inserted;
}

function normalizeFsPath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") return null;
  return path.normalize(inputPath.trim().replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, ""));
}

function parseDateToMysql(value) {
  if (!value) return null;
  if (typeof value === "number") {
    const ms = value > 1000000000000 ? value : value * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace("T", " ");
    return null;
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace("T", " ");
  return null;
}

function getAdmZipAvailability() {
  try {
    return { available: true, module: "adm-zip", resolved_path: require.resolve("adm-zip") };
  } catch (error) {
    return { available: false, module: "adm-zip", error: error.message, install_command: "npm install adm-zip" };
  }
}

function loadAdmZip() {
  try {
    return require("adm-zip");
  } catch (error) {
    const dependencyError = new Error("Missing dependency: adm-zip. Run `npm install adm-zip` in the api folder, then restart the server.");
    dependencyError.code = "MISSING_ADM_ZIP";
    dependencyError.install_command = "npm install adm-zip";
    throw dependencyError;
  }
}

function textFromAny(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textFromAny).filter(Boolean).join("\n");
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (typeof value.message === "string") return value.message;
    if (typeof value.response === "string") return value.response;
    if (typeof value.prompt === "string") return value.prompt;
    if (Array.isArray(value.parts)) return value.parts.map(textFromAny).filter(Boolean).join("\n");
    if (Array.isArray(value.segments)) return value.segments.map(textFromAny).filter(Boolean).join("\n");
    if (Array.isArray(value.candidates)) return value.candidates.map(textFromAny).filter(Boolean).join("\n");
  }
  return "";
}

function normalizeRole(rawRole, index) {
  const value = String(rawRole || "").toLowerCase();
  if (["human", "user", "customer", "me", "client"].includes(value)) return "user";
  if (["assistant", "model", "bot", "ai", "claude", "gemini"].includes(value)) return "assistant";
  if (["system", "tool"].includes(value)) return value;
  return index % 2 === 0 ? "user" : "assistant";
}

function looksLikeMessage(item) {
  if (!item || typeof item !== "object") return false;
  return Boolean(
    item.text || item.content || item.message || item.prompt || item.response || item.parts ||
    item.sender || item.role || item.author || item.authorRole || item.speaker
  );
}

function extractMessageList(conversation) {
  if (!conversation || typeof conversation !== "object") return [];
  const candidates = [
    conversation.messages,
    conversation.chat_messages,
    conversation.chatMessages,
    conversation.turns,
    conversation.entries,
    conversation.history,
    conversation.items,
    conversation.events
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  if (Array.isArray(conversation)) return conversation;
  return [];
}

function normalizeMessages(platform, conversation) {
  const rawMessages = extractMessageList(conversation);
  const messages = [];

  rawMessages.forEach((item, index) => {
    if (!item || typeof item !== "object") return;

    // Some Gemini Takeout shapes store a user query and model response in one turn.
    if (item.prompt || item.query || item.userInput) {
      const text = textFromAny(item.prompt || item.query || item.userInput).trim();
      if (text) {
        messages.push({
          source_message_id: String(item.id || item.uuid || `${platform}_turn_${index}_user`),
          parent_message_id: null,
          message_order: messages.length + 1,
          role: "user",
          author_name: "user",
          content_type: "text",
          content_text: text,
          raw_json: item,
          source_created_at: parseDateToMysql(item.created_at || item.create_time || item.createdTime || item.timestamp)
        });
      }
    }

    if (item.response || item.answer || item.modelResponse) {
      const text = textFromAny(item.response || item.answer || item.modelResponse).trim();
      if (text) {
        messages.push({
          source_message_id: String(item.id || item.uuid || `${platform}_turn_${index}_assistant`),
          parent_message_id: null,
          message_order: messages.length + 1,
          role: "assistant",
          author_name: platform,
          content_type: "text",
          content_text: text,
          raw_json: item,
          source_created_at: parseDateToMysql(item.created_at || item.create_time || item.createdTime || item.timestamp)
        });
      }
    }

    if (!looksLikeMessage(item)) return;
    const contentText = textFromAny(item.text || item.content || item.message || item.parts || item.body).trim();
    if (!contentText) return;
    const rawRole = item.sender || item.role || item.author?.role || item.authorRole || item.speaker || item.type;
    messages.push({
      source_message_id: String(item.uuid || item.id || item.message_id || item.messageId || `${platform}_msg_${index}`),
      parent_message_id: item.parent_uuid || item.parent_id || item.parentMessageId || null,
      message_order: messages.length + 1,
      role: normalizeRole(rawRole, messages.length),
      author_name: item.author?.name || item.sender || item.role || null,
      content_type: item.content_type || item.contentType || "text",
      content_text: contentText,
      raw_json: item,
      source_created_at: parseDateToMysql(item.created_at || item.create_time || item.createdTime || item.timestamp)
    });
  });

  return messages;
}

function findConversationArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const keys = ["conversations", "chats", "chat_sessions", "sessions", "items", "data", "history"];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.conversation && typeof payload.conversation === "object") return [payload.conversation];
  if (payload.title || payload.name || payload.messages || payload.chat_messages || payload.turns) return [payload];
  return [];
}

function normalizeConversation(platform, raw, fallbackIndex, sourceName) {
  const messages = normalizeMessages(platform, raw);
  if (!messages.length) return null;

  const id = raw.uuid || raw.id || raw.conversation_id || raw.conversationId || raw.chat_id || raw.name || `${sourceName || platform}_${fallbackIndex}`;
  const title = raw.title || raw.name || raw.summary || raw.conversation_title || `${platform.toUpperCase()} Imported Conversation ${fallbackIndex + 1}`;
  const normalizedText = messages.map((m) => `${m.role}: ${m.content_text}`).join("\n\n");

  return {
    source_conversation_id: String(id).slice(0, 255),
    title: String(title || "Untitled").slice(0, 500),
    conversation_url: raw.url || raw.conversation_url || null,
    author_hint: raw.account || raw.user || raw.author || null,
    source_created_at: parseDateToMysql(raw.created_at || raw.create_time || raw.createdTime || raw.createTime || raw.timestamp),
    source_updated_at: parseDateToMysql(raw.updated_at || raw.update_time || raw.updatedTime || raw.updateTime),
    message_count: messages.length,
    raw_json: raw,
    normalized_text: normalizedText,
    content_hash: sha256(`${platform}|${id}|${normalizedText}`),
    messages
  };
}

function normalizePayload(platform, payload, sourceName) {
  const rawConversations = findConversationArray(payload);
  return rawConversations
    .map((item, index) => normalizeConversation(platform, item, index, sourceName))
    .filter(Boolean);
}

function readJsonPayloadsFromFile(filePath, platform) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".zip") {
    const AdmZip = loadAdmZip();
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries().filter((entry) => {
      const name = entry.entryName.toLowerCase();
      return !entry.isDirectory && name.endsWith(".json") && (
        name.includes(platform) || name.includes("conversation") || name.includes("chat") || name.includes("takeout") || name.includes("data")
      );
    });
    return entries.map((entry) => {
      const text = entry.getData().toString("utf8");
      return { source_name: entry.entryName, payload: JSON.parse(text) };
    });
  }

  const text = fs.readFileSync(filePath, "utf8");
  return [{ source_name: path.basename(filePath), payload: JSON.parse(text) }];
}

async function insertNormalizedConversation({ batchId, platform, projectCode, conversation, skipDuplicates }) {
  if (skipDuplicates !== false) {
    const [duplicateRows] = await pool.query(
      `SELECT id FROM raw_imported_conversations WHERE content_hash = ? LIMIT 1`,
      [conversation.content_hash]
    );
    if (duplicateRows.length) {
      return { imported: false, duplicate: true, existing_id: duplicateRows[0].id, messages: 0 };
    }
  }

  const sessionId = `${platform}-import-${conversation.source_conversation_id}`.slice(0, 255);
  const [conversationResult] = await pool.query(`
    INSERT INTO raw_imported_conversations
      (batch_id, source_platform, source_conversation_id, project_code, session_id, title,
       conversation_url, author_hint, source_created_at, source_updated_at, import_status,
       message_count, raw_json, normalized_text, content_hash, review_status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    batchId,
    platform,
    conversation.source_conversation_id,
    projectCode,
    sessionId,
    conversation.title,
    conversation.conversation_url,
    conversation.author_hint,
    conversation.source_created_at,
    conversation.source_updated_at,
    "imported",
    conversation.message_count,
    safeJson(conversation.raw_json),
    conversation.normalized_text,
    conversation.content_hash,
    "pending_review",
    `Imported from ${platform} export by Phase 15-5`
  ]);

  const importedConversationId = Number(conversationResult.insertId);
  const insertedMessages = await insertMessagesInBatches({
    messages: conversation.messages,
    importedConversationId,
    batchId,
    platform,
    progressLabel: `"${String(conversation.title || sessionId).slice(0, 60)}"`
  });

  return { imported: true, duplicate: false, imported_conversation_id: importedConversationId, messages: insertedMessages };
}

async function getPlatformCounts(platform) {
  const [rows] = await pool.query(`
    SELECT
      COUNT(*) AS conversations,
      COALESCE(SUM(message_count), 0) AS messages,
      SUM(CASE WHEN summary_queue_id IS NOT NULL THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN memory_id IS NOT NULL THEN 1 ELSE 0 END) AS completed
    FROM raw_imported_conversations
    WHERE source_platform = ?
  `, [platform]);
  return {
    conversations: Number(rows[0]?.conversations || 0),
    messages: Number(rows[0]?.messages || 0),
    queued: Number(rows[0]?.queued || 0),
    completed: Number(rows[0]?.completed || 0)
  };
}

async function getGeminiClaudeImporterStatus() {
  await importedConversationService.ensureImportedConversationTables();
  const dependency = getAdmZipAvailability();
  const gemini = await getPlatformCounts("gemini");
  const claude = await getPlatformCounts("claude");

  const checklist = [
    { key: "import_storage_ready", group: "storage", label: "Phase 15 imported conversation storage tables are ready.", required: true, status: "PASS" },
    { key: "adm_zip_dependency", group: "dependency", label: "adm-zip is available for ZIP export files.", required: true, status: dependency.available ? "PASS" : "FAIL" },
    { key: "gemini_parser_ready", group: "parser", label: "Gemini JSON / Takeout-style parser is available.", required: true, status: "PASS" },
    { key: "claude_parser_ready", group: "parser", label: "Claude JSON export parser is available.", required: true, status: "PASS" },
    { key: "shared_import_pipeline", group: "workflow", label: "Gemini / Claude imports use the same raw_imported_conversations and imported_conversation_messages pipeline.", required: true, status: "PASS" },
    { key: "summary_queue_ready", group: "workflow", label: "Imported Gemini / Claude conversations can be queued through Phase 15-3 after import.", required: true, status: "PASS" }
  ];

  const ready = checklist.filter((item) => item.required).every((item) => item.status === "PASS");
  return {
    ok: ready,
    phase: "15-5",
    checked_at: nowIso(),
    importer_status: ready ? "READY" : "ACTION_REQUIRED",
    dependency,
    supported_platforms: ["gemini", "claude"],
    counts: { gemini, claude },
    checklist,
    sample_import_bodies: {
      gemini_json_or_zip: {
        source_platform: "gemini",
        file_path: "D:\\00. Ai_Memory_System\\imports\\gemini_takeout.zip",
        project_code: "rbs_ai_memory",
        skip_duplicates: true,
        limit: 3
      },
      claude_json_or_zip: {
        source_platform: "claude",
        file_path: "D:\\00. Ai_Memory_System\\imports\\claude_export.json",
        project_code: "rbs_ai_memory",
        skip_duplicates: true,
        limit: 3
      }
    },
    next_actions: ready
      ? ["Run parser tests first.", "Import with limit 3 before full import.", "Use Phase 15-3 to queue imported Gemini / Claude conversations for summary."]
      : ["Run npm install adm-zip, restart npm run dev, then recheck status."]
  };
}

async function importGeminiClaudeExport(options = {}) {
  await importedConversationService.ensureImportedConversationTables();
  const platform = String(options.source_platform || options.platform || "").toLowerCase();
  const filePath = normalizeFsPath(options.file_path || options.export_file_path || options.zip_file_path);
  const projectCode = options.project_code || "rbs_ai_memory";
  const limit = Number(options.limit || 0);
  const skipDuplicates = options.skip_duplicates !== false;

  if (!["gemini", "claude"].includes(platform)) {
    return { ok: false, phase: "15-5", import_status: "FAILED", error: { code: "INVALID_PLATFORM", message: "source_platform must be gemini or claude." } };
  }
  if (!filePath) {
    return { ok: false, phase: "15-5", import_status: "FAILED", error: { code: "FILE_PATH_REQUIRED", message: "file_path is required." } };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, phase: "15-5", import_status: "FAILED", error: { code: "FILE_NOT_FOUND", message: "The file path does not exist on this server PC.", file_path: filePath } };
  }
  if (path.extname(filePath).toLowerCase() === ".zip" && !getAdmZipAvailability().available) {
    return { ok: false, phase: "15-5", import_status: "FAILED", error: { code: "MISSING_ADM_ZIP", message: "adm-zip is required for ZIP import.", install_command: "npm install adm-zip" } };
  }

  const batchCode = `${platform}_import_${Date.now()}`;
  const [batchResult] = await pool.query(`
    INSERT INTO imported_conversation_batches
      (batch_code, source_platform, source_file_name, project_code, import_status, options_json, started_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
  `, [batchCode, platform, path.basename(filePath), projectCode, "running", safeJson({ ...options, file_path: filePath }), `Phase 15-5 ${platform} import started`]);
  const batchId = Number(batchResult.insertId);

  let normalized = [];
  try {
    const payloads = readJsonPayloadsFromFile(filePath, platform);
    for (const item of payloads) {
      normalized = normalized.concat(normalizePayload(platform, item.payload, item.source_name));
    }
    if (limit > 0) normalized = normalized.slice(0, limit);

    let importedConversations = 0;
    let importedMessages = 0;
    let duplicateConversations = 0;
    let failedConversations = 0;
    const results = [];

    for (let i = 0; i < normalized.length; i += 1) {
      const conversation = normalized[i];
      console.log(`[gemini-claude-importer] conversation ${i + 1}/${normalized.length}: "${String(conversation.title || "").slice(0, 60)}" (${conversation.message_count || 0} messages)`);
      try {
        const result = await insertNormalizedConversation({ batchId, platform, projectCode, conversation, skipDuplicates });
        results.push(result);
        if (result.duplicate) duplicateConversations += 1;
        if (result.imported) {
          importedConversations += 1;
          importedMessages += result.messages;
        }
      } catch (error) {
        failedConversations += 1;
        results.push({ imported: false, failed: true, error: error.message, title: conversation.title });
      }
    }

    await pool.query(`
      UPDATE imported_conversation_batches
      SET import_status = ?, total_conversations = ?, total_messages = ?, imported_conversations = ?,
          imported_messages = ?, duplicate_conversations = ?, failed_conversations = ?, completed_at = NOW(),
          notes = ?, updated_at = NOW()
      WHERE id = ?
    `, [
      failedConversations > 0 ? "completed_with_errors" : "completed",
      normalized.length,
      normalized.reduce((sum, item) => sum + Number(item.message_count || 0), 0),
      importedConversations,
      importedMessages,
      duplicateConversations,
      failedConversations,
      `Phase 15-5 ${platform} import completed`,
      batchId
    ]);

    return {
      ok: failedConversations === 0,
      phase: "15-5",
      import_status: failedConversations > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      source_platform: platform,
      batch_id: batchId,
      file_path: filePath,
      total_normalized_conversations: normalized.length,
      imported_conversations: importedConversations,
      imported_messages: importedMessages,
      duplicate_conversations: duplicateConversations,
      failed_conversations: failedConversations,
      sample_results: results.slice(0, 10),
      next_actions: ["Open Import Memory Search.", "Queue imported conversations through Phase 15-3.", "Run npm run worker:summary after queueing."]
    };
  } catch (error) {
    await pool.query(`UPDATE imported_conversation_batches SET import_status = ?, failed_conversations = ?, completed_at = NOW(), notes = ?, updated_at = NOW() WHERE id = ?`, [
      "failed",
      1,
      `Phase 15-5 import failed: ${error.message}`,
      batchId
    ]);
    return { ok: false, phase: "15-5", import_status: "FAILED", source_platform: platform, batch_id: batchId, error: { message: error.message, code: error.code || "IMPORT_FAILED" } };
  }
}

async function runGeminiClaudeImporterTest(options = {}) {
  const scenario = options.scenario || "synthetic_parser";
  const platform = String(options.source_platform || options.platform || "gemini").toLowerCase();
  const status = await getGeminiClaudeImporterStatus();

  if (scenario === "synthetic_parser") {
    const samplePayload = platform === "claude"
      ? { conversations: [{ uuid: "claude-test-1", name: "Claude Import Test", created_at: nowIso(), chat_messages: [{ uuid: "m1", sender: "human", text: "Summarize Phase 15." }, { uuid: "m2", sender: "assistant", text: "Phase 15 imports historical conversations." }] }] }
      : { conversations: [{ id: "gemini-test-1", title: "Gemini Import Test", createdTime: nowIso(), turns: [{ role: "user", text: "What is the import plan?" }, { role: "model", text: "Import, normalize, queue, and summarize." }] }] };
    const normalized = normalizePayload(platform, samplePayload, `${platform}_synthetic.json`);
    return {
      ok: normalized.length === 1 && normalized[0].messages.length >= 2,
      phase: "15-5",
      test_status: normalized.length === 1 && normalized[0].messages.length >= 2 ? "PASS" : "FAIL",
      scenario,
      source_platform: platform,
      normalized_conversation_count: normalized.length,
      normalized_message_count: normalized.reduce((sum, item) => sum + item.messages.length, 0),
      sample: normalized[0] || null,
      status,
      phase15_6_entry_allowed: normalized.length === 1 && normalized[0].messages.length >= 2 && status.importer_status === "READY"
    };
  }

  return {
    ok: status.importer_status === "READY",
    phase: "15-5",
    test_status: status.importer_status === "READY" ? "PASS" : "FAIL",
    scenario,
    status,
    phase15_6_entry_allowed: status.importer_status === "READY"
  };
}

module.exports = {
  getGeminiClaudeImporterStatus,
  importGeminiClaudeExport,
  runGeminiClaudeImporterTest,
  normalizePayload
};
