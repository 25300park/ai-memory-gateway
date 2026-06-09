const pool = require("../config/db");

const MAX_PROMPT_CHAR_LENGTH = 12000;

function formatAssetList(items) {
  if (!items || items.length === 0) {
    return "None";
  }

  return items
    .map((item) => {
      return `- ${item.title}: ${item.content}`;
    })
    .join("\n");
}

function formatRecentBuffer(recentBuffer) {
  if (!recentBuffer || recentBuffer.length === 0) {
    return "No recent conversation.";
  }

  return recentBuffer
    .map((r) => `${r.role.toUpperCase()}: ${r.message}`)
    .join("\n");
}

function formatLongTermMemory(memories) {
  if (!memories || memories.length === 0) {
    return "No relevant long-term memory found.";
  }

  return memories
    .map((m, index) => {
      return [
        `Memory ${index + 1}`,
        `Title: ${m.title}`,
        `Summary: ${m.summary}`,
        `Detail: ${m.detail || ""}`,
        `Tags: ${m.tags || ""}`,
        `Importance: ${m.importance}`,
        `Matched Terms: ${(m.matched_terms || []).join(", ")}`,
        `Total Score: ${m.total_score || 0}`,
        `Created At: ${m.created_at}`
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

async function getDefaultTemplate() {
  const [rows] = await pool.query(
    `
    SELECT content
    FROM ai_prompt_templates
    WHERE template_code = 'default_context_prompt'
      AND is_active = TRUE
    LIMIT 1
    `
  );

  if (!rows.length) {
    return `
You are working with the following project context.

[PROJECT PERSONA]
{{persona}}

[PROJECT VOCABULARY]
{{vocabulary}}

[REFERENCE DOCUMENTS]
{{reference_doc}}

[RECENT CONVERSATION]
{{recent_buffer}}

[RELEVANT LONG-TERM MEMORY]
{{long_term_memory}}

[USER QUESTION]
{{user_question}}

[IMPORTANT RULES]
{{rules}}

[OUTPUT FORMAT / WORKFLOW]
{{formatting}}
{{workflow}}

Answer based only on the provided project context and the user's question.
`;
  }

  return rows[0].content;
}

function applyLengthLimit(prompt) {
  if (prompt.length <= MAX_PROMPT_CHAR_LENGTH) {
    return prompt;
  }

  return prompt.slice(0, MAX_PROMPT_CHAR_LENGTH) + `

[TRUNCATED]
The prompt was shortened to fit the maximum context limit.
`;
}

async function buildPrompt({ question, context }) {
  const template = await getDefaultTemplate();

  const grouped = context.groupedAssets || {};

  const persona = formatAssetList(grouped.persona);
  const vocabulary = formatAssetList(grouped.vocabulary);
  const referenceDoc = formatAssetList(grouped.reference_doc);
  const rules = formatAssetList(grouped.rule);
  const formatting = formatAssetList(grouped.formatting);
  const workflow = formatAssetList(grouped.workflow);

  const recentText = formatRecentBuffer(context.recentBuffer);
  const memoryText = formatLongTermMemory(context.longTermMemory);

  let finalPrompt = template
    .replace("{{project_assets}}", [
      "[PERSONA]",
      persona,
      "",
      "[VOCABULARY]",
      vocabulary,
      "",
      "[REFERENCE DOCUMENTS]",
      referenceDoc
    ].join("\n"))
    .replace("{{persona}}", persona)
    .replace("{{vocabulary}}", vocabulary)
    .replace("{{reference_doc}}", referenceDoc)
    .replace("{{recent_buffer}}", recentText)
    .replace("{{long_term_memory}}", memoryText)
    .replace("{{user_question}}", question)
    .replace("{{project_rules}}", rules)
    .replace("{{rules}}", rules)
    .replace("{{formatting}}", formatting)
    .replace("{{workflow}}", workflow);

  finalPrompt += `

[STRICT FINAL INSTRUCTIONS]
${rules}

[FORMAT AND WORKFLOW]
${formatting}
${workflow}
`;

  return applyLengthLimit(finalPrompt);
}

module.exports = {
  buildPrompt
};