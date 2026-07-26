'use strict';

/**
 * Phase 10-2: automated runner for the eval question bank.
 * Executes each question against the running API (POST /ai/agent/ask or
 * /ai/agent/collab), records the raw result, and writes it to
 * results/eval-{timestamp}.json. No grading here (that's Phase 10-3) -
 * this only executes and stores results.
 *
 * Usage:
 *   node scripts/run-eval.js                 (all 21 questions)
 *   node scripts/run-eval.js --only=A,G       (category filter)
 *   node scripts/run-eval.js --limit=5        (first N questions only)
 *   node scripts/run-eval.js --only=A,G --limit=3
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const QUESTIONS_PATH = path.join(__dirname, 'eval-questions.json');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const DELAY_BETWEEN_QUESTIONS_MS = 1000;

const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3010}`;
const adminToken = process.env.ADMIN_TOKEN || '';

function parseArgs(argv) {
  const args = { only: null, limit: null };
  for (const arg of argv) {
    if (arg.startsWith('--only=')) {
      args.only = arg.slice('--only='.length).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) args.limit = n;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAsk(item) {
  const res = await fetch(`${baseUrl}/ai/agent/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-admin-token': adminToken
    },
    body: JSON.stringify({
      question: item.question,
      project_code: item.project_code,
      provider: item.provider,
      live: item.live,
      enable_crm_tool: item.enable_crm_tool,
      enable_github_tool: item.enable_github_tool
    })
  });
  const body = await res.json();
  return {
    http_status: res.status,
    ok: Boolean(body.ok),
    answer: body.answer ?? null,
    provider_used: body.provider_used ?? null,
    question_type: body.question_type ?? null,
    tool_used: body.tool_used ?? null,
    crm_tool_used: body.crm_tool_used ?? null,
    github_tool_used: body.github_tool_used ?? null,
    decision_reason: body.decision_reason ?? null,
    error: body.ok === false ? (body.error?.message || body.message || 'unknown error') : null,
    raw_response: body
  };
}

async function callCollab(item) {
  const res = await fetch(`${baseUrl}/ai/agent/collab`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-admin-token': adminToken
    },
    body: JSON.stringify({
      question: item.question,
      project_code: item.project_code,
      confirm_live: true
    })
  });
  const body = await res.json();
  return {
    http_status: res.status,
    ok: Boolean(body.ok),
    answer: body.final_content ?? null,
    provider_used: 'collab(anthropic+lmstudio)',
    question_type: null,
    tool_used: null,
    crm_tool_used: null,
    github_tool_used: null,
    decision_reason: body.final_verdict ?? null,
    error: body.ok === false ? (body.error?.message || body.message || 'unknown error') : null,
    raw_response: body
  };
}

async function runQuestion(item) {
  const startedAt = Date.now();

  if (item.skip_execution) {
    return {
      id: item.id,
      category: item.category,
      question: item.question,
      expected: item.expected,
      status: 'skipped',
      reason: 'skip_execution=true in eval-questions.json (no standalone API call for this item)',
      duration_ms: 0
    };
  }

  try {
    const result = item.use_collab_mode ? await callCollab(item) : await callAsk(item);
    return {
      id: item.id,
      category: item.category,
      question: item.question,
      expected: item.expected,
      status: result.ok ? 'success' : 'failed',
      duration_ms: Date.now() - startedAt,
      ...result
    };
  } catch (error) {
    return {
      id: item.id,
      category: item.category,
      question: item.question,
      expected: item.expected,
      status: 'error',
      duration_ms: Date.now() - startedAt,
      error: error.message
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bank = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));

  let questions = bank.questions;
  if (args.only) {
    questions = questions.filter((q) => args.only.includes(String(q.category).toUpperCase()));
  }
  if (args.limit) {
    questions = questions.slice(0, args.limit);
  }

  if (questions.length === 0) {
    console.log('No questions matched the given filters. Nothing to run.');
    return;
  }

  console.log(`Running ${questions.length} question(s) against ${baseUrl}`);
  if (args.only) console.log(`Category filter: ${args.only.join(', ')}`);
  if (args.limit) console.log(`Limit: ${args.limit}`);
  console.log('');

  const results = [];
  const runStartedAt = Date.now();

  for (let i = 0; i < questions.length; i += 1) {
    const item = questions[i];
    console.log(`[${i + 1}/${questions.length}] ${item.id} 실행 중...`);
    const result = await runQuestion(item);
    results.push(result);
    console.log(`  -> ${result.status} (${result.duration_ms}ms)`);

    if (i < questions.length - 1) {
      await sleep(DELAY_BETWEEN_QUESTIONS_MS);
    }
  }

  const totalDurationMs = Date.now() - runStartedAt;
  const successCount = results.filter((r) => r.status === 'success').length;
  const failedCount = results.filter((r) => r.status === 'failed' || r.status === 'error').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const outputPath = path.join(RESULTS_DIR, `eval-${timestamp}.json`);

  const summary = {
    phase: '10-2',
    run_at: new Date().toISOString(),
    base_url: baseUrl,
    filters: { only: args.only, limit: args.limit },
    total_questions: questions.length,
    success_count: successCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    total_duration_ms: totalDurationMs
  };

  fs.writeFileSync(outputPath, JSON.stringify({ summary, results }, null, 2), 'utf8');

  console.log('');
  console.log('--- Summary ---');
  console.log(`Total: ${questions.length}, Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`);
  console.log(`Total duration: ${totalDurationMs}ms`);
  console.log(`Results saved to: ${outputPath}`);
}

main().catch((error) => {
  console.error('run-eval.js failed:', error.message);
  process.exit(1);
});
