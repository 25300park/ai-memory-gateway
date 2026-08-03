'use strict';

/**
 * Phase 10-3: scores an already-executed eval run (results/eval-{timestamp}.json)
 * against the assertions in scripts/eval-questions.json. Does not run any new
 * questions - this only reads a past result file and grades it.
 *
 * Usage:
 *   node scripts/score-eval.js results/eval-{timestamp}.json
 *   node scripts/score-eval.js                (auto-picks the newest eval-*.json in results/)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const RESULTS_DIR = process.env.RESULTS_DIR || path.join(__dirname, '..', 'results');
const QUESTIONS_PATH = path.join(__dirname, 'eval-questions.json');

// Phase 1: any answer/error text matching these means the provider itself
// failed (quota, timeout, etc) - such a run tells us nothing about whether
// the agent's *logic* is correct, so it's marked inconclusive instead of
// being scored pass/fail.
const PROVIDER_FAILURE_PATTERNS = ['429', 'quota', 'provider execution failed', 'er_connection_timeout'];

function findLatestResultsFile() {
  const files = fs.readdirSync(RESULTS_DIR)
    .filter((f) => /^eval-.*\.json$/.test(f))
    .sort();
  if (files.length === 0) throw new Error(`No eval-*.json files found in ${RESULTS_DIR}`);
  return path.join(RESULTS_DIR, files[files.length - 1]);
}

function isProviderFailure(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  return PROVIDER_FAILURE_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

function ruleBasedCheck(result, assertions) {
  const notes = [];
  let pass = true;

  if (assertions.expect_question_type !== undefined) {
    const actual = result.question_type ?? null;
    const ok = actual === assertions.expect_question_type;
    notes.push(`question_type=${actual}(기대:${assertions.expect_question_type}) ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) pass = false;
  }

  if (assertions.expect_crm_tool_used !== undefined) {
    const actual = Boolean(result.crm_tool_used);
    const ok = actual === assertions.expect_crm_tool_used;
    notes.push(`crm_tool_used=${actual}(기대:${assertions.expect_crm_tool_used}) ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) pass = false;
  }

  if (assertions.expect_github_tool_used !== undefined) {
    const actual = Boolean(result.github_tool_used);
    const ok = actual === assertions.expect_github_tool_used;
    notes.push(`github_tool_used=${actual}(기대:${assertions.expect_github_tool_used}) ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) pass = false;
  }

  if (assertions.expect_provider_not !== undefined) {
    const actual = result.provider_used ?? null;
    const ok = actual !== assertions.expect_provider_not;
    notes.push(`provider_used=${actual}(금지:${assertions.expect_provider_not}) ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) pass = false;
  }

  if (assertions.expect_contains_any !== undefined) {
    const answerLower = String(result.answer || '').toLowerCase();
    const ok = assertions.expect_contains_any.some((kw) => answerLower.includes(String(kw).toLowerCase()));
    notes.push(`contains_any(${assertions.expect_contains_any.join('/')}) ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) pass = false;
  }

  return { verdict: pass ? 'pass' : 'fail', reason: notes.join('; ') };
}

// B-3's expected count comes from live CRM data, not a value we can hardcode
// in eval-questions.json. crm-tools.service.js's searchListings() caps
// results at 20 rows (a safety limit for the agent tool, not meant for
// counting), and the real SALE count here is 33 - so that function can't be
// reused for this; a direct COUNT(*) is required instead.
async function getRealSaleCountFromCrm() {
  const { Pool } = require('pg');
  const connectionString = process.env.MRHOMES_CRM_DB_URL;
  if (!connectionString) throw new Error('MRHOMES_CRM_DB_URL is not set in .env');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const result = await pool.query("SELECT COUNT(*) AS cnt FROM ai_agent_listings_view WHERE transaction_type = 'SALE'");
    return Number(result.rows[0].cnt);
  } finally {
    await pool.end();
  }
}

async function judgeWithAI({ question, answer, judgeCriteria }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { verdict: 'inconclusive', reason: 'ANTHROPIC_API_KEY is not set - cannot run AI judge' };

  const model = process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-sonnet-4-5';
  const prompt = [
    `질문: ${question}`,
    `답변: ${answer}`,
    `판정 기준: ${judgeCriteria}`,
    '',
    '위 답변이 판정 기준을 충족하는지 PASS 또는 FAIL로만 답하고, 한 줄 이유를 덧붙여라.',
    '형식: "PASS: 이유" 또는 "FAIL: 이유"'
  ].join('\n');

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (error) {
    return { verdict: 'inconclusive', reason: `AI judge request failed: ${error.message}` };
  }

  const body = await res.json();
  if (!res.ok) {
    return { verdict: 'inconclusive', reason: `AI judge call failed: ${body?.error?.message || res.status}` };
  }

  const text = (body.content || []).map((b) => b.text || '').join('').trim();
  const upper = text.toUpperCase();
  if (upper.startsWith('PASS')) return { verdict: 'pass', reason: text };
  if (upper.startsWith('FAIL')) return { verdict: 'fail', reason: text };
  return { verdict: 'inconclusive', reason: `AI judge response unparseable: ${text.slice(0, 200)}` };
}

async function scoreItem(result, questionDef) {
  const base = { id: result.id, category: result.category };

  if (result.status === 'skipped') {
    return { ...base, verdict: 'skipped', reason: 'run-eval.js에서 skip_execution 처리된 항목 (별도 API 호출 없음)' };
  }

  const answerText = result.answer || '';
  if (isProviderFailure(answerText) || isProviderFailure(result.error)) {
    return { ...base, verdict: 'inconclusive', reason: 'provider 장애로 판정 불가 (429/quota/등 패턴 감지)' };
  }

  const assertions = questionDef?.assertions || {};

  // B-2 asks for "the most recently registered listing", but neither
  // ai_agent_listings_view nor (RLS-blocked) listings expose a queryable
  // timestamp to this role - there is no way to determine the real answer,
  // so this is always inconclusive rather than guessed at.
  if (result.id === 'B-2') {
    return {
      ...base,
      verdict: 'inconclusive',
      reason: 'CRM DB에 조회 가능한 timestamp 컬럼이 없어(뷰에 없음, 원본 테이블은 RLS로 차단) 실제 최신 등록 여부를 객관적으로 판정 불가'
    };
  }

  if (assertions.needs_ai_judge) {
    let judgeCriteria = assertions.judge_criteria || questionDef?.expected || '';

    if (result.id === 'B-3') {
      try {
        const realCount = await getRealSaleCountFromCrm();
        judgeCriteria += ` (참고: 채점 시점 실제 CRM DB의 매매(SALE) 매물 건수는 ${realCount}건입니다. 답변에 명시된 개수가 이 값과 일치하는지로 판단하세요.)`;
      } catch (error) {
        return { ...base, verdict: 'inconclusive', reason: `실제 SALE 건수 조회 실패: ${error.message}` };
      }
    }

    const verdict = await judgeWithAI({ question: result.question, answer: answerText, judgeCriteria });
    return { ...base, ...verdict };
  }

  return { ...base, ...ruleBasedCheck(result, assertions) };
}

async function main() {
  const inputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : findLatestResultsFile();

  console.log(`Scoring: ${inputPath}`);

  const evalRun = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const bank = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
  const questionsById = new Map(bank.questions.map((q) => [q.id, q]));

  const scored = [];
  for (const result of evalRun.results) {
    const questionDef = questionsById.get(result.id);
    const usesAiJudge = questionDef?.assertions?.needs_ai_judge && result.status !== 'skipped' && result.id !== 'B-2';
    console.log(`[${result.id}] ${usesAiJudge ? 'AI judge 중...' : '채점 중...'}`);

    const item = await scoreItem(result, questionDef);
    scored.push(item);
    console.log(`  -> ${item.verdict.toUpperCase()}${item.reason ? ` - ${item.reason}` : ''}`);

    if (usesAiJudge) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const counts = scored.reduce((acc, item) => {
    acc[item.verdict] = (acc[item.verdict] || 0) + 1;
    return acc;
  }, {});

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const outputPath = path.join(RESULTS_DIR, `score-${timestamp}.json`);

  fs.writeFileSync(outputPath, JSON.stringify({
    phase: '10-3',
    scored_at: new Date().toISOString(),
    source_file: inputPath,
    counts,
    results: scored
  }, null, 2), 'utf8');

  console.log('');
  console.log('--- Summary ---');
  console.log(`PASS: ${counts.pass || 0}, FAIL: ${counts.fail || 0}, INCONCLUSIVE: ${counts.inconclusive || 0}, SKIPPED: ${counts.skipped || 0}`);
  console.log(`Results saved to: ${outputPath}`);
}

main().catch((error) => {
  console.error('score-eval.js failed:', error.message);
  process.exit(1);
});
