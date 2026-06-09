const pool = require("../config/db");

const RECENT_BUFFER_LIMIT = 5;
const LONG_TERM_MEMORY_LIMIT = 7;

const STOP_WORDS = new Set([
  // English common words
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "by", "as", "at",
  "from", "into", "about", "what", "why", "how", "when", "where",
  "this", "that", "these", "those", "it", "its", "can", "could",
  "should", "would", "please", "tell", "show", "explain",

  // Korean common words
  "현재", "구조", "다음", "단계", "요약", "정리", "설명", "해주세요",
  "해줘", "무엇", "어떻게", "그리고", "또한", "관련", "진행", "부분",
  "내용", "확인", "보여줘", "알려줘", "시작", "작업", "기능",
  "무슨", "어떤", "왜", "때문", "위해", "대한", "대해", "하면",
  "합니다", "입니다", "있는", "없는", "같은", "바로", "계속"
]);

const KEYWORD_SYNONYMS = {
  "요약": ["summary", "summarize", "compression", "memory_summary"],
  "기억": ["memory", "long_term_memory", "ai_memory"],
  "장기기억": ["long_term_memory", "ai_memory", "memory"],
  "최근대화": ["recent_buffer", "Recent Buffer", "short_term_memory"],
  "검색": ["search", "retrieval", "debug-search", "RAG"],
  "점수": ["score", "match_score", "total_score", "ranking"],
  "라우터": ["router", "ai_router_rules", "model routing"],
  "모델": ["model", "ai_model_profiles", "provider"],
  "프롬프트": ["prompt", "prompt_templates", "context assembly"],
  "자산": ["project_assets", "asset", "persona", "rule"],
  "규칙": ["rule", "project_assets", "instruction"],
  "워크플로우": ["workflow", "pipeline", "process"],
  "원문": ["conversation_logs", "raw_text", "ai_conversation_logs"],
  "큐": ["queue", "ai_summary_queue", "pending", "completed"],
  "워커": ["worker", "summary_worker", "summary.loop.worker"],
  "게이트웨이": ["gateway", "AI Gateway", "Node.js"],
  "노드": ["Node.js", "node", "server"],
  "마리아디비": ["MariaDB", "mariadb", "rbs_viber"],
  "디비": ["DB", "database", "MariaDB"],
  "벡터": ["vector", "embedding", "ai_embeddings", "RAG"],
  "태그": ["tags", "metadata"],

  "summary": ["요약", "summary_worker", "ai_summary_queue"],
  "memory": ["기억", "ai_memory", "long_term_memory"],
  "gateway": ["게이트웨이", "AI Gateway", "Node.js"],
  "worker": ["워커", "summary_worker", "summary.loop.worker"],
  "router": ["라우터", "ai_router_rules", "model routing"],
  "prompt": ["프롬프트", "ai_prompt_templates", "context"],
  "context": ["컨텍스트", "context build", "recent_buffer", "long_term_memory"],
  "recent": ["recent_buffer", "Recent Buffer", "최근대화"],
  "buffer": ["recent_buffer", "Recent Buffer"],
  "project_assets": ["자산", "persona", "rule", "workflow", "formatting"]
};

function addSynonyms(keywords) {
  const expanded = [...keywords];

  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    const directSynonyms = KEYWORD_SYNONYMS[keyword] || KEYWORD_SYNONYMS[lower];

    if (directSynonyms && directSynonyms.length) {
      expanded.push(...directSynonyms);
    }
  }

  return [...new Set(expanded)].slice(0, 20);
}

function extractKeywords(question) {
  if (!question) return [];

  const normalized = question
    .replace(/[^\p{L}\p{N}_\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized.split(" ");

  const keywords = [];

  for (const word of words) {
    const cleaned = word.trim();

    if (!cleaned) continue;
    if (cleaned.length < 2) continue;
    if (STOP_WORDS.has(cleaned.toLowerCase())) continue;

    keywords.push(cleaned);
  }

  const lower = question.toLowerCase();

  // 중요 복합 키워드 보강
  if (lower.includes("ai memory")) keywords.push("AI Memory");
  if (lower.includes("memory gateway")) keywords.push("Memory Gateway");
  if (lower.includes("ai gateway")) keywords.push("AI Gateway");
  if (lower.includes("summary worker")) keywords.push("Summary Worker");
  if (lower.includes("recent buffer")) keywords.push("Recent Buffer");
  if (lower.includes("long-term memory")) keywords.push("Long-term Memory");
  if (lower.includes("long term memory")) keywords.push("Long-term Memory");
  if (lower.includes("project assets")) keywords.push("project_assets");
  if (lower.includes("debug-search")) keywords.push("debug-search");
  if (lower.includes("context preview")) keywords.push("context preview");
  if (lower.includes("mariadb")) keywords.push("MariaDB");
  if (lower.includes("node")) keywords.push("Node.js");
  if (lower.includes("router")) keywords.push("Router");
  if (lower.includes("prompt")) keywords.push("Prompt");

  // 한국어 복합 키워드 보강
  if (question.includes("장기 기억")) keywords.push("장기기억", "long_term_memory", "ai_memory");
  if (question.includes("최근 대화")) keywords.push("최근대화", "recent_buffer");
  if (question.includes("요약 워커")) keywords.push("Summary Worker", "summary_worker");
  if (question.includes("검색 방식")) keywords.push("search", "retrieval", "score");
  if (question.includes("프로젝트 자산")) keywords.push("project_assets");
  if (question.includes("프롬프트 조립")) keywords.push("prompt", "context assembly");
  if (question.includes("모델 선택")) keywords.push("router", "ai_router_rules");
  if (question.includes("원문 저장")) keywords.push("ai_conversation_logs");

  const uniqueKeywords = [...new Set(keywords)];

  return addSynonyms(uniqueKeywords);
}

async function getProjectAssets(project_code) {
  const [rows] = await pool.query(
    `
    SELECT
      asset_type,
      title,
      content,
      priority
    FROM project_assets
    WHERE project_code = ?
      AND is_active = TRUE
    ORDER BY priority DESC, created_at ASC
    `,
    [project_code]
  );

  return rows;
}

async function getRecentBuffer(session_id) {
  const [rows] = await pool.query(
    `
    SELECT
      role,
      message,
      created_at
    FROM ai_recent_buffer
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [session_id, RECENT_BUFFER_LIMIT]
  );

  return rows.reverse();
}

async function searchMemoryByTerm(project_code, term, limit = 10) {
  const keyword = `%${term || ""}%`;

  const [rows] = await pool.query(
    `
    SELECT
      id,
      project_code,
      source_ai,
      memory_type,
      title,
      summary,
      detail,
      tags,
      importance,
      created_at,

      (
        CASE WHEN title LIKE ? THEN 50 ELSE 0 END +
        CASE WHEN tags LIKE ? THEN 50 ELSE 0 END +
        CASE WHEN summary LIKE ? THEN 30 ELSE 0 END +
        CASE WHEN detail LIKE ? THEN 15 ELSE 0 END +

        CASE WHEN memory_type = 'architecture_decision' THEN 20 ELSE 0 END +
        CASE WHEN memory_type = 'project_summary' THEN 18 ELSE 0 END +
        CASE WHEN memory_type = 'conversation_summary' THEN 10 ELSE 0 END +
        CASE WHEN memory_type = 'error_solution' THEN 18 ELSE 0 END +
        CASE WHEN memory_type = 'workflow' THEN 15 ELSE 0 END +

        COALESCE(importance, 0) * 6
      ) AS match_score

    FROM ai_memory
    WHERE project_code = ?
      AND status = 'active'
      AND (
        title LIKE ?
        OR summary LIKE ?
        OR detail LIKE ?
        OR tags LIKE ?
        OR memory_type LIKE ?
      )
    ORDER BY match_score DESC, importance DESC, created_at DESC
    LIMIT ?
    `,
    [
      keyword,
      keyword,
      keyword,
      keyword,

      project_code,
      keyword,
      keyword,
      keyword,
      keyword,
      keyword,
      Number(limit)
    ]
  );

  return rows.map((row) => ({
    ...row,
    matched_term: term,
    match_score: Number(row.match_score || 0)
  }));
}

function normalizeBigIntId(value) {
  return typeof value === "bigint" ? value.toString() : String(value);
}

function dedupeAndRankMemories(memories) {
  const map = new Map();

  for (const memory of memories) {
    const id = normalizeBigIntId(memory.id);

    if (!map.has(id)) {
      map.set(id, {
        ...memory,
        total_score: Number(memory.match_score || 0),
        matched_terms: memory.matched_term ? [memory.matched_term] : []
      });
    } else {
      const existing = map.get(id);

      existing.total_score += Number(memory.match_score || 0);

      if (
        memory.matched_term &&
        !existing.matched_terms.includes(memory.matched_term)
      ) {
        existing.matched_terms.push(memory.matched_term);
      }

      if (Number(memory.match_score || 0) > Number(existing.match_score || 0)) {
        existing.match_score = Number(memory.match_score || 0);
        existing.matched_term = memory.matched_term;
      }
    }
  }

  return [...map.values()]
    .sort((a, b) => {
      const scoreB = Number(b.total_score || 0);
      const scoreA = Number(a.total_score || 0);

      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }

      const importanceB = Number(b.importance || 0);
      const importanceA = Number(a.importance || 0);

      if (importanceB !== importanceA) {
        return importanceB - importanceA;
      }

      return new Date(b.created_at) - new Date(a.created_at);
    })
    .slice(0, LONG_TERM_MEMORY_LIMIT);
}

async function getLongTermMemory(project_code, question) {
  const keywords = extractKeywords(question);

  const results = [];

  // 1. 질문 전체 문장으로 먼저 검색
  const fullQuestionResults = await searchMemoryByTerm(
    project_code,
    question,
    5
  );
  results.push(...fullQuestionResults);

  // 2. 추출 키워드별 검색
  for (const keyword of keywords) {
    const keywordResults = await searchMemoryByTerm(
      project_code,
      keyword,
      5
    );

    results.push(...keywordResults);
  }

  const finalResults = dedupeAndRankMemories(results);

  return {
    keywords,
    memories: finalResults
  };
}

function groupAssetsByType(assets) {
  const grouped = {
    persona: [],
    rule: [],
    vocabulary: [],
    reference_doc: [],
    formatting: [],
    workflow: [],
    other: []
  };

  for (const asset of assets) {
    if (grouped[asset.asset_type]) {
      grouped[asset.asset_type].push(asset);
    } else {
      grouped.other.push(asset);
    }
  }

  return grouped;
}

async function buildContext({ project_code, session_id, question }) {
  const projectAssets = await getProjectAssets(project_code);
  const recentBuffer = await getRecentBuffer(session_id);
  const longTermResult = await getLongTermMemory(project_code, question);

  const groupedAssets = groupAssetsByType(projectAssets);

  return {
    project_code,
    question,
    projectAssets,
    groupedAssets,
    recentBuffer,
    longTermMemory: longTermResult.memories,
    extractedKeywords: longTermResult.keywords,
    limits: {
      recent_buffer_limit: RECENT_BUFFER_LIMIT,
      long_term_memory_limit: LONG_TERM_MEMORY_LIMIT
    }
  };
}

function normalizeAssetForPacket(asset) {
  return {
    asset_type: asset.asset_type,
    title: asset.title,
    content: asset.content,
    priority: Number(asset.priority || 0)
  };
}

function normalizeRecentBufferForPacket(item, index) {
  return {
    order: index + 1,
    role: item.role,
    message: item.message,
    created_at: item.created_at
  };
}

function normalizeMemoryForPacket(memory) {
  return {
    id: memory.id,
    project_code: memory.project_code,
    source_ai: memory.source_ai,
    memory_type: memory.memory_type,
    title: memory.title,
    summary: memory.summary,
    detail: memory.detail,
    tags: memory.tags,
    importance: Number(memory.importance || 0),
    matched_terms: memory.matched_terms || [],
    total_score: Number(memory.total_score || memory.match_score || 0),
    created_at: memory.created_at
  };
}

function buildSystemContextText(context) {
  const lines = [];

  lines.push("# AI Memory Gateway Context Packet");
  lines.push(`Project Code: ${context.project_code}`);
  lines.push("");

  lines.push("## 1. Project Assets");
  if (!context.projectAssets.length) {
    lines.push("- No active project assets were found.");
  } else {
    for (const asset of context.projectAssets) {
      lines.push(`- [${asset.asset_type}] ${asset.title || "Untitled"}`);
      if (asset.content) lines.push(`  ${asset.content}`);
    }
  }
  lines.push("");

  lines.push("## 2. Recent Buffer");
  if (!context.recentBuffer.length) {
    lines.push("- No recent buffer messages were found for this session.");
  } else {
    for (const item of context.recentBuffer) {
      lines.push(`- ${item.role}: ${item.message}`);
    }
  }
  lines.push("");

  lines.push("## 3. Summarized Memory");
  if (!context.longTermMemory.length) {
    lines.push("- No summarized memory matched the user message.");
  } else {
    for (const memory of context.longTermMemory) {
      lines.push(`- [${memory.memory_type}] ${memory.title || "Untitled"}`);
      if (memory.summary) lines.push(`  Summary: ${memory.summary}`);
      if (memory.detail) lines.push(`  Detail: ${memory.detail}`);
    }
  }

  return lines.join("\n");
}

function buildContextWarnings(context) {
  const warnings = [];

  if (!context.projectAssets.length) {
    warnings.push("No active Project Assets found for this project_code.");
  }

  if (!context.recentBuffer.length) {
    warnings.push("No Recent Buffer found for this session_id.");
  }

  if (!context.longTermMemory.length) {
    warnings.push("No Summarized Memory matched this user_message.");
  }

  return warnings;
}

async function buildContextPacket({
  project_code,
  session_id,
  user_message,
  question,
  include_text = true
}) {
  const finalQuestion = user_message || question || "";

  if (!project_code || !session_id || !finalQuestion) {
    throw new Error("project_code, session_id, and user_message are required.");
  }

  const context = await buildContext({
    project_code,
    session_id,
    question: finalQuestion
  });

  const warnings = buildContextWarnings(context);
  const systemContextText = include_text === false ? null : buildSystemContextText(context);

  return {
    ok: true,
    mode: "context_build",
    built_at: new Date().toISOString(),
    project_code,
    session_id,
    user_message: finalQuestion,
    context_packet: {
      meta: {
        project_code,
        session_id,
        built_at: new Date().toISOString(),
        source: "AI Memory Gateway Phase 10-1",
        layer_order: [
          "project_assets",
          "recent_buffer",
          "summarized_memory"
        ]
      },
      layers: {
        project_assets: context.projectAssets.map(normalizeAssetForPacket),
        recent_buffer: context.recentBuffer.map(normalizeRecentBufferForPacket),
        summarized_memory: context.longTermMemory.map(normalizeMemoryForPacket)
      },
      grouped_assets: context.groupedAssets,
      extracted_keywords: context.extractedKeywords,
      system_context_text: systemContextText,
      user_message: finalQuestion,
      warnings
    },
    summary: {
      project_assets_count: context.projectAssets.length,
      recent_buffer_count: context.recentBuffer.length,
      summarized_memory_count: context.longTermMemory.length,
      extracted_keywords_count: context.extractedKeywords.length,
      warnings_count: warnings.length,
      ready_for_ai_request: context.projectAssets.length > 0 ||
        context.recentBuffer.length > 0 ||
        context.longTermMemory.length > 0
    },
    limits: context.limits
  };
}


function buildLayerQualitySummary(context, finalPrompt, contextPacket) {
  const warnings = contextPacket?.context_packet?.warnings || [];
  const projectAssetsCount = context.projectAssets.length;
  const recentBufferCount = context.recentBuffer.length;
  const summarizedMemoryCount = context.longTermMemory.length;
  const promptLength = finalPrompt ? finalPrompt.length : 0;

  let readinessScore = 0;

  if (projectAssetsCount > 0) readinessScore += 30;
  if (recentBufferCount > 0) readinessScore += 25;
  if (summarizedMemoryCount > 0) readinessScore += 30;
  if (promptLength > 0) readinessScore += 10;
  if (!warnings.length) readinessScore += 5;

  readinessScore = Math.min(100, readinessScore);

  let readinessStatus = "READY";

  if (readinessScore < 40) {
    readinessStatus = "NOT_READY";
  } else if (readinessScore < 70 || warnings.length > 0) {
    readinessStatus = "READY_WITH_WARNINGS";
  }

  return {
    readiness_status: readinessStatus,
    readiness_score: readinessScore,
    prompt_length: promptLength,
    layer_counts: {
      project_assets: projectAssetsCount,
      recent_buffer: recentBufferCount,
      summarized_memory: summarizedMemoryCount,
      extracted_keywords: context.extractedKeywords.length,
      warnings: warnings.length
    },
    checks: {
      has_project_assets: projectAssetsCount > 0,
      has_recent_buffer: recentBufferCount > 0,
      has_summarized_memory: summarizedMemoryCount > 0,
      has_prompt: promptLength > 0,
      has_warnings: warnings.length > 0
    },
    warnings
  };
}

function buildPreviewLayerCards(context) {
  return {
    project_assets: context.projectAssets.map((asset, index) => ({
      order: index + 1,
      asset_type: asset.asset_type,
      title: asset.title || "Untitled",
      priority: Number(asset.priority || 0),
      content_preview: asset.content
        ? String(asset.content).slice(0, 500)
        : ""
    })),
    recent_buffer: context.recentBuffer.map((item, index) => ({
      order: index + 1,
      role: item.role,
      message_preview: item.message
        ? String(item.message).slice(0, 500)
        : "",
      created_at: item.created_at
    })),
    summarized_memory: context.longTermMemory.map((memory, index) => ({
      order: index + 1,
      id: memory.id,
      memory_type: memory.memory_type,
      title: memory.title || "Untitled",
      importance: Number(memory.importance || 0),
      total_score: Number(memory.total_score || memory.match_score || 0),
      matched_terms: memory.matched_terms || [],
      summary_preview: memory.summary
        ? String(memory.summary).slice(0, 500)
        : "",
      created_at: memory.created_at
    }))
  };
}

async function buildContextPreview({
  project_code,
  session_id,
  question,
  include_prompt = true,
  include_packet = true
}) {
  if (!project_code || !session_id || !question) {
    throw new Error("project_code, session_id, and question are required.");
  }

  const context = await buildContext({
    project_code,
    session_id,
    question
  });

  const contextPacket = await buildContextPacket({
    project_code,
    session_id,
    user_message: question,
    include_text: true
  });

  let finalPrompt = null;

  try {
    const { buildPrompt } = require("./prompt.service");
    finalPrompt = await buildPrompt({
      question,
      context
    });
  } catch (error) {
    finalPrompt = `Prompt build failed: ${error.message}`;
  }

  const quality = buildLayerQualitySummary(context, finalPrompt, contextPacket);

  return {
    ok: true,
    mode: "context_preview_v2",
    previewed_at: new Date().toISOString(),
    project_code,
    session_id,
    question,
    quality,
    extracted_keywords: context.extractedKeywords,
    layer_cards: buildPreviewLayerCards(context),
    grouped_assets: context.groupedAssets,
    final_prompt: include_prompt === false ? null : finalPrompt,
    context_packet: include_packet === false ? null : contextPacket.context_packet,
    summary: {
      project_assets_count: context.projectAssets.length,
      recent_buffer_count: context.recentBuffer.length,
      summarized_memory_count: context.longTermMemory.length,
      extracted_keywords_count: context.extractedKeywords.length,
      warnings_count: quality.warnings.length,
      readiness_status: quality.readiness_status,
      readiness_score: quality.readiness_score,
      prompt_length: quality.prompt_length
    },
    next_step: quality.readiness_status === "NOT_READY"
      ? "Add Project Assets, Recent Buffer, or relevant summarized memory before connecting the real AI response pipeline."
      : "This context preview is ready to be used as the basis for Phase 10-3 AI Request Pipeline."
  };
}


// =====================================================
// Phase 10-4: Production-oriented Context Assembly
// Memory Search + Recent Buffer + Project Assets 고도화
// =====================================================
const DEFAULT_ASSEMBLY_OPTIONS = {
  project_asset_limit: 12,
  recent_buffer_limit: 8,
  summarized_memory_limit: 10,
  max_prompt_chars: 12000
};

function normalizePositiveInt(value, fallback, max = 100) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function trimText(value, maxLength = 1600) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n[TRIMMED]`;
}

function scoreProjectAsset(asset) {
  const priority = Number(asset.priority || 0);
  const typeWeight = {
    persona: 40,
    rule: 35,
    workflow: 30,
    formatting: 25,
    vocabulary: 20,
    reference_doc: 15
  };

  return (typeWeight[asset.asset_type] || 10) + priority * 5;
}

function scoreRecentBufferItem(item, index, total) {
  const recencyScore = Math.max(1, total - index) * 10;
  const roleScore = item.role === "user" ? 8 : item.role === "assistant" ? 5 : 2;
  const contentScore = item.message ? Math.min(String(item.message).length / 40, 10) : 0;
  return Math.round(recencyScore + roleScore + contentScore);
}

function scoreAssemblyMemory(memory) {
  const score = Number(memory.total_score || memory.match_score || 0);
  const importance = Number(memory.importance || 0);
  const typeBoost = {
    architecture_decision: 25,
    project_summary: 22,
    workflow: 18,
    error_solution: 18,
    conversation_summary: 12
  };
  return Math.round(score + importance * 8 + (typeBoost[memory.memory_type] || 5));
}

function buildAssemblySections({ selectedAssets, selectedRecentBuffer, selectedMemories, question }) {
  const lines = [];

  lines.push("# Production Context Assembly");
  lines.push("");
  lines.push("## Project Assets");
  if (!selectedAssets.length) {
    lines.push("- No project assets selected.");
  } else {
    selectedAssets.forEach((asset, index) => {
      lines.push(`${index + 1}. [${asset.asset_type}] ${asset.title || "Untitled"}`);
      lines.push(`   ${trimText(asset.content, 900)}`);
    });
  }

  lines.push("");
  lines.push("## Recent Buffer");
  if (!selectedRecentBuffer.length) {
    lines.push("- No recent buffer selected.");
  } else {
    selectedRecentBuffer.forEach((item, index) => {
      lines.push(`${index + 1}. ${String(item.role || "unknown").toUpperCase()}: ${trimText(item.message, 700)}`);
    });
  }

  lines.push("");
  lines.push("## Relevant Summarized Memory");
  if (!selectedMemories.length) {
    lines.push("- No relevant summarized memory selected.");
  } else {
    selectedMemories.forEach((memory, index) => {
      lines.push(`${index + 1}. [${memory.memory_type}] ${memory.title || "Untitled"}`);
      lines.push(`   Summary: ${trimText(memory.summary, 900)}`);
      if (memory.detail) lines.push(`   Detail: ${trimText(memory.detail, 900)}`);
      if (memory.tags) lines.push(`   Tags: ${memory.tags}`);
      if (memory.matched_terms?.length) lines.push(`   Matched Terms: ${memory.matched_terms.join(", ")}`);
    });
  }

  lines.push("");
  lines.push("## User Question");
  lines.push(question);

  return lines.join("\n");
}

function buildAssemblyQuality({ selectedAssets, selectedRecentBuffer, selectedMemories, assembledPrompt, warnings }) {
  let score = 0;
  if (selectedAssets.length > 0) score += 30;
  if (selectedRecentBuffer.length > 0) score += 25;
  if (selectedMemories.length > 0) score += 30;
  if (assembledPrompt) score += 10;
  if (!warnings.length) score += 5;
  score = Math.min(100, score);

  let status = "READY_FOR_PIPELINE";
  if (score < 45) status = "NOT_READY";
  else if (score < 75 || warnings.length > 0) status = "READY_WITH_WARNINGS";

  return {
    status,
    score,
    warnings_count: warnings.length,
    prompt_length: assembledPrompt.length,
    counts: {
      project_assets: selectedAssets.length,
      recent_buffer: selectedRecentBuffer.length,
      summarized_memory: selectedMemories.length
    }
  };
}

async function getRecentBufferWithLimit(session_id, limit) {
  const [rows] = await pool.query(
    `
    SELECT
      role,
      message,
      created_at
    FROM ai_recent_buffer
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [session_id, Number(limit)]
  );

  return rows.reverse();
}

async function buildProductionContextAssembly({
  project_code,
  session_id,
  question,
  user_message,
  project_asset_limit,
  recent_buffer_limit,
  summarized_memory_limit,
  max_prompt_chars
}) {
  const finalQuestion = question || user_message || "";

  if (!project_code || !session_id || !finalQuestion) {
    throw new Error("project_code, session_id, and question are required.");
  }

  const options = {
    project_asset_limit: normalizePositiveInt(project_asset_limit, DEFAULT_ASSEMBLY_OPTIONS.project_asset_limit, 50),
    recent_buffer_limit: normalizePositiveInt(recent_buffer_limit, DEFAULT_ASSEMBLY_OPTIONS.recent_buffer_limit, 30),
    summarized_memory_limit: normalizePositiveInt(summarized_memory_limit, DEFAULT_ASSEMBLY_OPTIONS.summarized_memory_limit, 30),
    max_prompt_chars: normalizePositiveInt(max_prompt_chars, DEFAULT_ASSEMBLY_OPTIONS.max_prompt_chars, 50000)
  };

  const allAssets = await getProjectAssets(project_code);
  const selectedAssets = allAssets
    .map((asset) => ({ ...asset, assembly_score: scoreProjectAsset(asset) }))
    .sort((a, b) => Number(b.assembly_score || 0) - Number(a.assembly_score || 0))
    .slice(0, options.project_asset_limit);

  const recentRows = await getRecentBufferWithLimit(session_id, options.recent_buffer_limit);
  const selectedRecentBuffer = recentRows.map((item, index) => ({
    ...item,
    order: index + 1,
    assembly_score: scoreRecentBufferItem(item, index, recentRows.length)
  }));

  const longTermResult = await getLongTermMemory(project_code, finalQuestion);
  const selectedMemories = longTermResult.memories
    .map((memory) => ({ ...memory, assembly_score: scoreAssemblyMemory(memory) }))
    .sort((a, b) => Number(b.assembly_score || 0) - Number(a.assembly_score || 0))
    .slice(0, options.summarized_memory_limit);

  const warnings = [];
  if (!selectedAssets.length) warnings.push("No Project Assets were selected. Add persona/rules/workflow assets for better response quality.");
  if (!selectedRecentBuffer.length) warnings.push("No Recent Buffer was selected for this session_id.");
  if (!selectedMemories.length) warnings.push("No relevant Summarized Memory was selected from ai_memory.");

  let assembledPrompt = buildAssemblySections({
    selectedAssets,
    selectedRecentBuffer,
    selectedMemories,
    question: finalQuestion
  });

  let wasTrimmed = false;
  if (assembledPrompt.length > options.max_prompt_chars) {
    assembledPrompt = `${assembledPrompt.slice(0, options.max_prompt_chars)}\n\n[ASSEMBLY TRIMMED TO MAX PROMPT CHARS]`;
    wasTrimmed = true;
    warnings.push(`Assembled prompt was trimmed to ${options.max_prompt_chars} characters.`);
  }

  const quality = buildAssemblyQuality({
    selectedAssets,
    selectedRecentBuffer,
    selectedMemories,
    assembledPrompt,
    warnings
  });

  return {
    ok: true,
    mode: "production_context_assembly",
    phase: "10-4",
    assembled_at: new Date().toISOString(),
    project_code,
    session_id,
    question: finalQuestion,
    options,
    quality,
    extracted_keywords: longTermResult.keywords,
    selected_layers: {
      project_assets: selectedAssets.map(normalizeAssetForPacket),
      recent_buffer: selectedRecentBuffer.map(normalizeRecentBufferForPacket),
      summarized_memory: selectedMemories.map(normalizeMemoryForPacket)
    },
    assembly_trace: {
      project_assets_available: allAssets.length,
      project_assets_selected: selectedAssets.length,
      recent_buffer_selected: selectedRecentBuffer.length,
      summarized_memory_selected: selectedMemories.length,
      search_keywords: longTermResult.keywords,
      was_trimmed: wasTrimmed,
      layer_order: ["project_assets", "recent_buffer", "summarized_memory", "user_question"]
    },
    assembled_prompt: assembledPrompt,
    warnings,
    next_step: quality.status === "NOT_READY"
      ? "Add Project Assets, Recent Buffer, or Summarized Memory before live AI response execution."
      : "This assembly is ready to be used by the AI Request Pipeline in the next Phase 10 steps."
  };
}

module.exports = {
  buildContext,
  buildContextPacket,
  buildContextPreview,
  buildProductionContextAssembly,
  extractKeywords,
  getLongTermMemory
};