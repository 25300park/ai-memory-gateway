'use strict';

/**
 * Phase 10-4: builds a comparison report across all past scoring runs
 * (results/score-{timestamp}.json). Reads only counts/verdicts - never raw
 * question/answer text - so the generated report is safe to commit under
 * docs/eval-reports/ (unlike results/*.json, which holds real CRM data and
 * conversation content and stays gitignored).
 *
 * Usage:
 *   node scripts/report-eval.js
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = process.env.RESULTS_DIR || path.join(__dirname, '..', 'results');
const REPORTS_DIR = process.env.REPORTS_DIR || path.join(__dirname, '..', 'docs', 'eval-reports');

const CATEGORY_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const VERDICTS = ['pass', 'fail', 'inconclusive', 'skipped'];

function loadScoreFiles() {
  const files = fs.readdirSync(RESULTS_DIR)
    .filter((f) => /^score-.*\.json$/.test(f))
    .sort();
  return files.map((f) => ({
    file: f,
    data: JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'))
  }));
}

function pct(n, total) {
  if (!total) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function buildCategoryStats(run) {
  const stats = new Map();
  for (const item of run.data.results) {
    if (!stats.has(item.category)) {
      stats.set(item.category, { pass: 0, fail: 0, inconclusive: 0, skipped: 0, total: 0 });
    }
    const s = stats.get(item.category);
    s[item.verdict] = (s[item.verdict] || 0) + 1;
    s.total += 1;
  }
  return stats;
}

function verdictMap(run) {
  const map = new Map();
  for (const item of run.data.results) map.set(item.id, item.verdict);
  return map;
}

function verdictChangeLabel(prevVerdict, currVerdict) {
  if (prevVerdict === currVerdict) return null;
  const isRegression = currVerdict === 'fail' && prevVerdict !== 'fail';
  const isImprovement = prevVerdict === 'fail' && currVerdict === 'pass';
  let tag = '';
  if (isRegression) tag = ' 🔴 (회귀 발생)';
  else if (isImprovement) tag = ' (개선됨)';
  return `${prevVerdict} → ${currVerdict}${tag}`;
}

function renderRunSection(run, index, lines) {
  const counts = run.data.counts || {};
  const total = VERDICTS.reduce((sum, v) => sum + (counts[v] || 0), 0);

  lines.push(`## 회차 ${index + 1}: ${run.file}`);
  lines.push('');
  lines.push(`- 채점 시각: ${run.data.scored_at}`);
  lines.push(`- 원본 실행 파일: ${path.basename(run.data.source_file || '')}`);
  lines.push('');
  lines.push('| 판정 | 건수 | 비율 |');
  lines.push('|------|------|------|');
  for (const v of VERDICTS) {
    lines.push(`| ${v.toUpperCase()} | ${counts[v] || 0} | ${pct(counts[v] || 0, total)} |`);
  }
  lines.push(`| **합계** | **${total}** | 100% |`);
  lines.push('');

  const categoryStats = buildCategoryStats(run);
  lines.push('### 카테고리별 PASS율');
  lines.push('');
  lines.push('| 카테고리 | PASS | FAIL | INCONCLUSIVE | SKIPPED | 합계 | PASS율 |');
  lines.push('|------|------|------|------|------|------|------|');
  for (const cat of CATEGORY_ORDER) {
    const s = categoryStats.get(cat);
    if (!s) continue;
    lines.push(`| ${cat} | ${s.pass} | ${s.fail} | ${s.inconclusive} | ${s.skipped} | ${s.total} | ${pct(s.pass, s.total)} |`);
  }
  lines.push('');
}

function renderComparisonSection(prevRun, currRun, lines) {
  const prevMap = verdictMap(prevRun);
  const currMap = verdictMap(currRun);
  const changes = [];

  for (const [id, currVerdict] of currMap) {
    const prevVerdict = prevMap.get(id);
    if (prevVerdict === undefined) continue; // question is new in this run, nothing to compare
    const label = verdictChangeLabel(prevVerdict, currVerdict);
    if (label) changes.push(`${id}: ${label}`);
  }

  lines.push(`## 변화: ${prevRun.file} → ${currRun.file}`);
  lines.push('');
  if (changes.length === 0) {
    lines.push('변화 없음 (모든 문항의 verdict가 직전 회차와 동일).');
  } else {
    for (const line of changes) lines.push(`- ${line}`);
  }
  lines.push('');
}

function main() {
  const runs = loadScoreFiles();

  if (runs.length === 0) {
    console.log(`No score-*.json files found in ${RESULTS_DIR}. Run scripts/score-eval.js first.`);
    return;
  }

  const title = 'Phase 10 Eval 채점 비교 리포트';
  const mdLines = [];
  mdLines.push(`# ${title}`);
  mdLines.push('');
  mdLines.push(`생성 시각: ${new Date().toISOString()}`);
  mdLines.push(`대상 회차 수: ${runs.length}`);
  mdLines.push('');

  if (runs.length === 1) {
    mdLines.push('> 현재 score 파일이 1개뿐이라 회차 간 비교는 아직 불가능합니다. ' +
      'score-eval.js를 다시 실행해 두 번째 회차가 쌓이면 다음 리포트부터 비교가 나타납니다.');
    mdLines.push('');
  }

  console.log(`Found ${runs.length} score file(s).`);
  console.log('');

  for (let i = 0; i < runs.length; i += 1) {
    const sectionStart = mdLines.length;
    renderRunSection(runs[i], i, mdLines);
    console.log(mdLines.slice(sectionStart).join('\n'));
  }

  for (let i = 1; i < runs.length; i += 1) {
    const sectionStart = mdLines.length;
    renderComparisonSection(runs[i - 1], runs[i], mdLines);
    console.log(mdLines.slice(sectionStart).join('\n'));
  }

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const outputPath = path.join(REPORTS_DIR, `report-${timestamp}.md`);
  fs.writeFileSync(outputPath, mdLines.join('\n') + '\n', 'utf8');

  console.log('');
  console.log(`Report saved to: ${outputPath}`);
}

main();
