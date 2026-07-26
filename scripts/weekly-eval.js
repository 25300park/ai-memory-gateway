'use strict';

/**
 * Phase 10-5: runs the full eval pipeline in order - run-eval.js (all 21
 * questions) -> score-eval.js (grades the run just produced) ->
 * report-eval.js (builds the comparison report) - intended to be triggered
 * weekly by Windows Task Scheduler.
 *
 * Before doing anything, it checks that the API server is actually up.
 * Phase 9 already hit a case where the mini PC/NAS was unreachable and the
 * failure surfaced only as silence - this pipeline logs a clear "server is
 * down, did not run" line instead of quietly doing nothing or burning real
 * API spend against connection-refused errors.
 *
 * Usage:
 *   node scripts/weekly-eval.js
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT_DIR = path.join(__dirname, '..');
const RESULTS_DIR = path.join(ROOT_DIR, 'results');
const LOG_PATH = path.join(ROOT_DIR, 'logs', 'weekly-eval.log');
const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3010}`;

function timestamp() {
  return new Date().toISOString();
}

function appendLog(line) {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8');
}

function logAndExit(line, code) {
  console.error(line);
  appendLog(line);
  process.exit(code);
}

async function checkServerHealth() {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch (_) {
    return false;
  }
}

function runStep(label, scriptName) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName)], {
    stdio: 'inherit',
    cwd: ROOT_DIR
  });
  return result.status === 0;
}

function findLatestResultsFile() {
  const files = fs.readdirSync(RESULTS_DIR)
    .filter((f) => /^eval-.*\.json$/.test(f))
    .sort();
  if (files.length === 0) return null;
  return path.join(RESULTS_DIR, files[files.length - 1]);
}

async function main() {
  const startedAt = Date.now();
  console.log(`Weekly eval pipeline starting at ${timestamp()}`);
  console.log(`Checking API server health at ${baseUrl}/health ...`);

  const healthy = await checkServerHealth();
  if (!healthy) {
    logAndExit(
      `[${timestamp()}] SKIPPED - 서버가 꺼져 있어 실행하지 않았습니다 (${baseUrl}/health 응답 없음).`,
      1
    );
    return;
  }

  console.log('Server is up. Proceeding with run-eval.js -> score-eval.js -> report-eval.js.');

  const runOk = runStep('1/3 run-eval.js (전체 21문항)', 'run-eval.js');
  if (!runOk) {
    logAndExit(`[${timestamp()}] FAILED - run-eval.js 단계에서 중단. score-eval.js, report-eval.js는 실행되지 않았습니다.`, 1);
    return;
  }

  // run-eval.js can exit 0 even if the server died mid-run (each question
  // catches its own connection error into the results file rather than
  // crashing the process) - guard against scoring/reporting on a run where
  // every single question failed, since that's not real logic-testing
  // signal and would just burn AI-judge calls on error text.
  const latestFile = findLatestResultsFile();
  if (latestFile) {
    const runSummary = JSON.parse(fs.readFileSync(latestFile, 'utf8')).summary;
    if (runSummary && runSummary.success_count === 0) {
      logAndExit(
        `[${timestamp()}] FAILED - run-eval.js는 종료됐지만 0/${runSummary.total_questions}문항만 성공(서버가 실행 중간에 죽었을 가능성). score-eval.js, report-eval.js는 실행되지 않았습니다.`,
        1
      );
      return;
    }
  }

  const scoreOk = runStep('2/3 score-eval.js', 'score-eval.js');
  if (!scoreOk) {
    logAndExit(`[${timestamp()}] FAILED - score-eval.js 단계에서 중단. report-eval.js는 실행되지 않았습니다.`, 1);
    return;
  }

  const reportOk = runStep('3/3 report-eval.js', 'report-eval.js');
  if (!reportOk) {
    logAndExit(`[${timestamp()}] FAILED - report-eval.js 단계에서 중단.`, 1);
    return;
  }

  const durationMs = Date.now() - startedAt;
  const successMsg = `[${timestamp()}] SUCCESS - 전체 파이프라인(run -> score -> report) ${durationMs}ms 만에 완료.`;
  console.log(`\n${successMsg}`);
  appendLog(successMsg);
}

main().catch((error) => {
  logAndExit(`[${timestamp()}] ERROR - 예상치 못한 오류: ${error.message}`, 1);
});
