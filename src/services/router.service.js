const pool = require("../config/db");

async function selectModel({ question }) {
  const [rules] = await pool.query(
    `
    SELECT r.*, m.provider, m.model_name, m.model_code
    FROM ai_router_rules r
    JOIN ai_model_profiles m
      ON r.target_model_code = m.model_code
    WHERE r.is_active = TRUE
      AND m.is_active = TRUE
    ORDER BY r.priority DESC
    `
  );

  const lowerQuestion = question.toLowerCase();

  for (const rule of rules) {
    const keywords = rule.trigger_keywords
      .split(",")
      .map((k) => k.trim().toLowerCase());

    const matched = keywords.some((keyword) =>
      lowerQuestion.includes(keyword)
    );

    if (matched) {
      return rule;
    }
  }

  const [fallbackRows] = await pool.query(
    `
    SELECT *
    FROM ai_model_profiles
    WHERE model_code = 'gpt_strategy'
    LIMIT 1
    `
  );

  if (!fallbackRows.length) {
    throw new Error("No fallback model profile found.");
  }

  return fallbackRows[0];
}

module.exports = {
  selectModel
};