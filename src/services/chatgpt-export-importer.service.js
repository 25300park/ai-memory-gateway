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

function getAdmZipAvailability() {
  try {
    const resolvedPath = require.resolve("adm-zip");
    return { available: true, module: "adm-zip", resolved_path: resolvedPath };
  } catch (error) {
    return {
      available: false,
      module: "adm-zip",
      error: error.message,
      install_command: "npm install adm-zip"
    };
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

function normalizeFsPath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") return null;
  const trimmed = inputPath.trim().replace(/^['\"]|['\"]$/g, "");
  return path.normalize(trimmed);
}

function unixToMysqlDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const ms = num > 1000000000000 ? num : num * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function extractContentText(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(extractContentText).filter(Boolean).join("\n");

  if (Array.isArray(content.parts)) {
    return content.parts.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        if (typeof part.text === "string") return part.text;
        if (typeof part.content === "string") return part.content;
        if (typeof part.name === "string" && part.asset_pointer) return `[attachment: ${part.name}]`;
        return safeJson(part) || "";
      }
      return "";
    }).filter(Boolean).join("\n");
  }

  if (typeof content.text === "string") return content.text;
  if (typeof content.content === "string") return content.content;
  if (content.result && typeof content.result === "string") return content.result;
  return "";
}

function extractMessageFromNode(node, fallbackOrder) {
  const msg = node?.message || node;
  if (!msg) return null;

  const role = msg.author?.role || msg.role || "unknown";
  const authorName = msg.author?.name || msg.author?.metadata?.real_author || role;
  const content = msg.content || {};
  const contentText = extractContentText(content).trim();
  const contentType = content.content_type || msg.content_type || "text";
  const messageId = msg.id || node?.id || `message_${fallbackOrder}`;
  const parentMessageId = node?.parent || msg.parent || null;

  if (!contentText && role !== "system") return null;

  return {
    source_message_id: messageId,
    parent_message_id: parentMessageId,
    message_order: fallbackOrder,
    role,
    author_name: authorName,
    content_type: contentType,
    content_text: contentText,
    raw_json: msg,
    source_created_at: unixToMysqlDate(msg.create_time || node?.create_time)
  };
}

function orderChatGPTMappingMessages(conversation) {
  const mapping = conversation.mapping || {};
  const nodes = Object.values(mapping).filter(Boolean);
  const currentNode = conversation.current_node;

  // Prefer the visible current conversation path where available.
  if (currentNode && mapping[currentNode]) {
    const pathNodes = [];
    const visited = new Set();
    let node = mapping[currentNode];
    while (node && !visited.has(node.id)) {
      visited.add(node.id);
      pathNodes.push(node);
      node = node.parent ? mapping[node.parent] : null;
    }
    const ordered = pathNodes.reverse();
    const parsed = ordered.map((n, index) => extractMessageFromNode(n, index + 1)).filter(Boolean);
    if (parsed.length) return parsed;
  }

  // Fallback: sort all mapped messages by create_time, then id.
  return nodes
    .filter((node) => node.message)
    .sort((a, b) => {
      const at = Number(a.message?.create_time || a.create_time || 0);
      const bt = Number(b.message?.create_time || b.create_time || 0);
      if (at !== bt) return at - bt;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })
    .map((node, index) => extractMessageFromNode(node, index + 1))
    .filter(Boolean);
}

function normalizeChatGPTConversation(conversation, index) {
  const sourceId = conversation.id || conversation.conversation_id || `chatgpt_conversation_${index + 1}`;
  const title = conversation.title || `ChatGPT Conversation ${index + 1}`;
  let messages = [];

  if (conversation.mapping && typeof conversation.mapping === "object") {
    messages = orderChatGPTMappingMessages(conversation);
  } else if (Array.isArray(conversation.messages)) {
    messages = conversation.messages
      .map((msg, msgIndex) => extractMessageFromNode(msg, msgIndex + 1))
      .filter(Boolean);
  }

  messages = messages.map((message, msgIndex) => ({ ...message, message_order: msgIndex + 1 }));

  const normalizedText = messages
    .map((message) => `${String(message.role || "unknown").toUpperCase()}: ${message.content_text || ""}`)
    .join("\n\n")
    .trim();

  const contentHash = sha256(["chatgpt", sourceId, title, normalizedText].join("\n"));

  return {
    source_conversation_id: String(sourceId),
    title: String(title).slice(0, 500),
    source_created_at: unixToMysqlDate(conversation.create_time),
    source_updated_at: unixToMysqlDate(conversation.update_time),
    raw_json: conversation,
    normalized_text: normalizedText,
    content_hash: contentHash,
    message_count: messages.length,
    messages
  };
}

function extractConversationsJsonFromZip(zipFilePath) {
  const AdmZip = loadAdmZip();
  const zip = new AdmZip(zipFilePath);
  const entries = zip.getEntries();
  const conversationsEntry = entries.find((entry) => {
    const name = entry.entryName.replace(/\\/g, "/").toLowerCase();
    return name === "conversations.json" || name.endsWith("/conversations.json");
  });

  if (!conversationsEntry) {
    const sampleEntries = entries.slice(0, 20).map((entry) => entry.entryName);
    const error = new Error("conversations.json was not found in the ZIP file.");
    error.code = "CONVERSATIONS_JSON_NOT_FOUND";
    error.sample_entries = sampleEntries;
    throw error;
  }

  const raw = conversationsEntry.getData().toString("utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    const error = new Error("conversations.json exists, but its root value is not an array.");
    error.code = "INVALID_CONVERSATIONS_JSON";
    throw error;
  }

  return { conversations: parsed, entry_name: conversationsEntry.entryName };
}

async function getLatestChatGPTBatch() {
  await importedConversationService.ensureImportedConversationTables();
  const [rows] = await pool.query(`
    SELECT id, batch_code, source_platform, source_file_name, project_code, import_status,
           total_conversations, imported_conversations, duplicate_conversations,
           failed_conversations, total_messages, imported_messages, created_at, updated_at
    FROM imported_conversation_batches
    WHERE source_platform = 'chatgpt'
    ORDER BY id DESC
    LIMIT 1
  `);
  return rows[0] || null;
}

function getChatGPTImporterChecklist() {
  const dependency = getAdmZipAvailability();
  return [
    {
      key: "import_storage_ready",
      group: "storage",
      label: "Phase 15-1 imported conversation storage tables are ready.",
      required: true,
      status: "PENDING"
    },
    {
      key: "adm_zip_dependency",
      group: "dependency",
      label: "adm-zip is installed for reading ChatGPT export ZIP files.",
      required: true,
      status: dependency.available ? "PASS" : "FAIL",
      install_command: dependency.available ? null : dependency.install_command
    },
    {
      key: "chatgpt_conversations_json",
      group: "parser",
      label: "Importer can find conversations.json inside ChatGPT export ZIP.",
      required: true,
      status: "READY_FOR_TEST"
    },
    {
      key: "message_tree_normalizer",
      group: "parser",
      label: "ChatGPT mapping tree can be converted into ordered messages.",
      required: true,
      status: "READY"
    },
    {
      key: "duplicate_hash_check",
      group: "safety",
      label: "Importer checks content_hash and can skip duplicate conversations.",
      required: true,
      status: "READY"
    },
    {
      key: "raw_payload_preserved",
      group: "safety",
      label: "Original conversation JSON is preserved in raw_imported_conversations.raw_json.",
      required: true,
      status: "READY"
    }
  ];
}

async function getChatGPTImporterStatus() {
  const storageStatus = await importedConversationService.getImportedConversationStatus();
  const dependency = getAdmZipAvailability();
  const latestBatch = await getLatestChatGPTBatch();
  const checklist = getChatGPTImporterChecklist().map((item) => {
    if (item.key === "import_storage_ready") {
      return { ...item, status: storageStatus.storage_status === "READY" ? "PASS" : "FAIL" };
    }
    return item;
  });

  const requiredFailures = checklist.filter((item) => item.required && item.status === "FAIL");

  return {
    ok: requiredFailures.length === 0,
    phase: "15-2",
    checked_at: nowIso(),
    importer_status: requiredFailures.length === 0 ? "READY" : "ACTION_REQUIRED",
    source_platform: "chatgpt",
    dependency,
    storage_status: storageStatus.storage_status,
    counts: storageStatus.counts,
    latest_chatgpt_batch: latestBatch,
    checklist,
    next_actions: dependency.available
      ? [
          "POST /ai/imports/chatgpt/import as multipart/form-data - field \"file\" (the export ZIP) plus project_code/skip_duplicates/limit as form fields.",
          "After import, proceed to Phase 15-3 Summary Queue linkage."
        ]
      : [
          "Run `npm install adm-zip` in the api folder.",
          "Restart the server with npm run dev.",
          "Then rerun ChatGPT Importer Status."
        ]
  };
}

async function insertNormalizedConversation({ batchId, projectCode, conversation, skipDuplicates }) {
  if (skipDuplicates !== false) {
    const [duplicateRows] = await pool.query(
      `SELECT id FROM raw_imported_conversations WHERE content_hash = ? LIMIT 1`,
      [conversation.content_hash]
    );
    if (duplicateRows.length) {
      return { imported: false, duplicate: true, existing_id: duplicateRows[0].id, messages: 0 };
    }
  }

  const sessionId = `chatgpt-import-${conversation.source_conversation_id}`.slice(0, 255);
  const [conversationResult] = await pool.query(`
    INSERT INTO raw_imported_conversations
      (batch_id, source_platform, source_conversation_id, project_code, session_id, title,
       source_created_at, source_updated_at, import_status, message_count, raw_json,
       normalized_text, content_hash, review_status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    batchId,
    "chatgpt",
    conversation.source_conversation_id,
    projectCode,
    sessionId,
    conversation.title,
    conversation.source_created_at,
    conversation.source_updated_at,
    "imported",
    conversation.message_count,
    safeJson(conversation.raw_json),
    conversation.normalized_text,
    conversation.content_hash,
    "pending_review",
    "Imported from ChatGPT export ZIP by Phase 15-2"
  ]);

  const importedConversationId = Number(conversationResult.insertId);
  let insertedMessages = 0;

  for (const message of conversation.messages) {
    await pool.query(`
      INSERT INTO imported_conversation_messages
        (imported_conversation_id, batch_id, source_platform, source_message_id, parent_message_id,
         message_order, role, author_name, content_type, content_text, raw_json, token_estimate,
         source_created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      importedConversationId,
      batchId,
      "chatgpt",
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
    ]);
    insertedMessages += 1;
  }

  return { imported: true, duplicate: false, imported_conversation_id: importedConversationId, messages: insertedMessages };
}

async function importChatGPTExportFromZip(options = {}) {
  await importedConversationService.ensureImportedConversationTables();

  const zipFilePath = normalizeFsPath(options.zip_file_path || options.zipPath || options.file_path);
  const projectCode = options.project_code || "rbs_ai_memory";
  const skipDuplicates = options.skip_duplicates !== false;
  const limit = Number(options.limit || 0);

  if (!zipFilePath) {
    return {
      ok: false,
      phase: "15-2",
      import_status: "FAILED",
      error: {
        code: "ZIP_FILE_PATH_REQUIRED",
        message: "zip_file_path is required. Put the ChatGPT export ZIP on the server PC, then pass its full path."
      },
      sample_body: {
        zip_file_path: "D:\\00. Ai_Memory_System\\imports\\chatgpt_export.zip",
        project_code: "rbs_ai_memory",
        skip_duplicates: true
      }
    };
  }

  if (!fs.existsSync(zipFilePath)) {
    return {
      ok: false,
      phase: "15-2",
      import_status: "FAILED",
      error: {
        code: "ZIP_FILE_NOT_FOUND",
        message: "The ZIP file path does not exist on this server PC.",
        zip_file_path: zipFilePath
      }
    };
  }

  const dependency = getAdmZipAvailability();
  if (!dependency.available) {
    return {
      ok: false,
      phase: "15-2",
      import_status: "FAILED",
      error: {
        code: "MISSING_ADM_ZIP",
        message: "adm-zip is not installed. Run npm install adm-zip, then restart the server.",
        install_command: "npm install adm-zip"
      }
    };
  }

  const batchCode = `chatgpt_import_${Date.now()}`;
  const [batchResult] = await pool.query(`
    INSERT INTO imported_conversation_batches
      (batch_code, source_platform, source_file_name, project_code, import_status,
       options_json, notes, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
  `, [
    batchCode,
    "chatgpt",
    path.basename(zipFilePath),
    projectCode,
    "running",
    safeJson({ zip_file_path: zipFilePath, skip_duplicates: skipDuplicates, limit }),
    "Phase 15-2 ChatGPT export ZIP import started"
  ]);

  const batchId = Number(batchResult.insertId);

  try {
    const extracted = extractConversationsJsonFromZip(zipFilePath);
    const normalized = extracted.conversations
      .slice(0, limit > 0 ? limit : extracted.conversations.length)
      .map((conversation, index) => normalizeChatGPTConversation(conversation, index))
      .filter((conversation) => conversation.message_count > 0 || conversation.normalized_text);

    let importedConversations = 0;
    let duplicateConversations = 0;
    let failedConversations = 0;
    let importedMessages = 0;
    const samples = [];

    for (const conversation of normalized) {
      try {
        const result = await insertNormalizedConversation({ batchId, projectCode, conversation, skipDuplicates });
        if (result.duplicate) {
          duplicateConversations += 1;
        } else if (result.imported) {
          importedConversations += 1;
          importedMessages += result.messages;
          if (samples.length < 5) {
            samples.push({
              imported_conversation_id: result.imported_conversation_id,
              title: conversation.title,
              message_count: conversation.message_count
            });
          }
        }
      } catch (conversationError) {
        failedConversations += 1;
      }
    }

    await pool.query(`
      UPDATE imported_conversation_batches
      SET import_status = ?, total_conversations = ?, total_messages = ?, imported_conversations = ?,
          imported_messages = ?, duplicate_conversations = ?, failed_conversations = ?, completed_at = NOW(),
          notes = ?
      WHERE id = ?
    `, [
      failedConversations > 0 ? "completed_with_errors" : "completed",
      extracted.conversations.length,
      normalized.reduce((sum, item) => sum + item.message_count, 0),
      importedConversations,
      importedMessages,
      duplicateConversations,
      failedConversations,
      `conversations.json entry: ${extracted.entry_name}`,
      batchId
    ]);

    return {
      ok: failedConversations === 0,
      phase: "15-2",
      import_status: failedConversations > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      batch_id: batchId,
      batch_code: batchCode,
      source_platform: "chatgpt",
      project_code: projectCode,
      zip_file_name: path.basename(zipFilePath),
      conversations_json_entry: extracted.entry_name,
      total_conversations_in_export: extracted.conversations.length,
      processed_conversations: normalized.length,
      imported_conversations: importedConversations,
      duplicate_conversations: duplicateConversations,
      failed_conversations: failedConversations,
      imported_messages: importedMessages,
      sample_imported: samples,
      phase15_3_entry_allowed: importedConversations > 0,
      status: await getChatGPTImporterStatus()
    };
  } catch (error) {
    await pool.query(`
      UPDATE imported_conversation_batches
      SET import_status = 'failed', failed_conversations = 1, completed_at = NOW(), notes = ?
      WHERE id = ?
    `, [error.message, batchId]);

    return {
      ok: false,
      phase: "15-2",
      import_status: "FAILED",
      batch_id: batchId,
      error: {
        code: error.code || "CHATGPT_IMPORT_FAILED",
        message: error.message,
        install_command: error.install_command || null,
        sample_entries: error.sample_entries || null
      }
    };
  }
}

async function runChatGPTImporterTest(options = {}) {
  await importedConversationService.ensureImportedConversationTables();

  const scenario = options.scenario || "synthetic_parser";
  const sampleConversation = {
    id: `phase15-2-sample-${Date.now()}`,
    title: "Phase 15-2 ChatGPT Parser Synthetic Test",
    create_time: Math.floor(Date.now() / 1000) - 60,
    update_time: Math.floor(Date.now() / 1000),
    current_node: "assistant-1",
    mapping: {
      root: { id: "root", message: null, parent: null, children: ["user-1"] },
      "user-1": {
        id: "user-1",
        parent: "root",
        children: ["assistant-1"],
        message: {
          id: "user-1",
          author: { role: "user" },
          create_time: Math.floor(Date.now() / 1000) - 30,
          content: { content_type: "text", parts: ["Please remember this imported conversation test."] }
        }
      },
      "assistant-1": {
        id: "assistant-1",
        parent: "user-1",
        children: [],
        message: {
          id: "assistant-1",
          author: { role: "assistant" },
          create_time: Math.floor(Date.now() / 1000) - 10,
          content: { content_type: "text", parts: ["The ChatGPT importer parser is working."] }
        }
      }
    }
  };

  const normalized = normalizeChatGPTConversation(sampleConversation, 0);
  const parserPass = normalized.message_count === 2 && normalized.normalized_text.includes("importer parser is working");

  return {
    ok: parserPass,
    phase: "15-2",
    test_status: parserPass ? "PASS" : "FAIL",
    scenario,
    dependency: getAdmZipAvailability(),
    normalized_sample: {
      title: normalized.title,
      message_count: normalized.message_count,
      content_hash: normalized.content_hash,
      normalized_text_preview: normalized.normalized_text.slice(0, 500)
    },
    importer_status: await getChatGPTImporterStatus()
  };
}

module.exports = {
  getChatGPTImporterStatus,
  getChatGPTImporterChecklist,
  importChatGPTExportFromZip,
  runChatGPTImporterTest,
  normalizeChatGPTConversation
};
