'use strict';

/**
 * Phase 12-2: executes an approved code_change_proposal from pending_actions inside an
 * isolated git worktree, driving a headless coding agent CLI to make the change, then
 * captures the resulting diff back onto the pending_actions row.
 *
 * Phase 12-4: the CLI itself is now pluggable via `engine` ('claude' | 'codex', default
 * 'claude') - the worktree/spawn/diff-capture/cleanup logic is engine-agnostic and fully
 * reused, only the command line differs:
 *   - claude: `claude -p "<instruction>" --dangerously-skip-permissions`
 *   - codex:  `codex exec --sandbox workspace-write --ask-for-approval never "<instruction>"`
 *     (codex's `--full-auto` is a deprecated compatibility flag per OpenAI's docs -
 *     `--sandbox workspace-write` + `--ask-for-approval never` is the current no-prompt,
 *     write-enabled combination: https://learn.chatgpt.com/docs/non-interactive-mode.
 *     Verified via docs, not `codex --help`, since codex isn't installed on this machine
 *     as of Phase 12-4 - call checkEngineAvailability() before relying on engine:'codex'.)
 *
 * This never merges anything into the real branch - the worktree's branch is left behind
 * (not deleted) so a human can inspect/merge it manually via normal git commands. The
 * worktree directory itself IS removed after the diff is captured, whether the run
 * succeeded, failed, or timed out, so no zombie worktrees accumulate.
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const pendingActionsService = require('./pending-actions.service');

// Only this repo may be targeted for now - execute-code accepts a repoPath from the
// request, but it must resolve to exactly one of these, or the request is rejected
// before anything touches the filesystem or spawns a process.
const ALLOWED_REPO_PATHS = ['D:\\00. Ai_Memory_System\\api'].map((p) => path.resolve(p).toLowerCase());

const DEFAULT_TIMEOUT_MS = Number(process.env.CODE_EXECUTION_TIMEOUT_MS) || 5 * 60 * 1000;
const MAX_CAPTURED_OUTPUT_CHARS = 5000;

const ENGINES = ['claude', 'codex'];
const DEFAULT_ENGINE = 'claude';

let executionInProgress = false;

function buildCommand(engine, instruction) {
  const quotedInstruction = `"${String(instruction).replace(/"/g, '\\"')}"`;
  if (engine === 'codex') {
    return `codex exec --sandbox workspace-write --ask-for-approval never ${quotedInstruction}`;
  }
  return `claude -p ${quotedInstruction} --dangerously-skip-permissions`;
}

function isAllowedRepoPath(repoPath) {
  if (!repoPath) return false;
  return ALLOWED_REPO_PATHS.includes(path.resolve(repoPath).toLowerCase());
}

// Best-effort presence check for each engine's CLI (`<engine> --version`) - lets a caller
// (status endpoint, or this file's own manual test script) find out which engines are
// actually usable on this machine before attempting execute-code with one of them.
function checkEngineAvailability() {
  const result = {};
  for (const engine of ENGINES) {
    const binary = engine === 'codex' ? 'codex' : 'claude';
    try {
      const version = execSync(`${binary} --version`, { stdio: 'pipe' }).toString().trim();
      result[engine] = { installed: true, version };
    } catch (error) {
      result[engine] = { installed: false, error: error.message };
    }
  }
  return result;
}

function truncate(text, max = MAX_CAPTURED_OUTPUT_CHARS) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}\n...[truncated, ${value.length - max} more chars]` : value;
}

async function ensureDiffResultColumn(db) {
  await pendingActionsService.ensurePendingActionsTable(db);
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'pending_actions' AND column_name = 'diff_result'`
  );
  if (Number(rows[0]?.cnt || 0) === 0) {
    await db.query(`ALTER TABLE pending_actions ADD COLUMN diff_result LONGTEXT NULL AFTER review_note`);
  }
}

function worktreePathFor(repoPath, branchName) {
  const parentDir = path.dirname(repoPath);
  const repoName = path.basename(repoPath);
  return path.join(parentDir, `${repoName}-worktrees`, branchName);
}

// Kills the whole process tree, not just the immediate PID - the engine CLI may itself
// spawn children, and a plain child.kill() on Windows does not reach those.
function killProcessTree(pid) {
  try {
    execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
  } catch (_) {
    // Process may have already exited on its own between timeout firing and the kill
    // attempt - not an error worth surfacing.
  }
}

function runEngineHeadless({ engine, worktreePath, instruction, timeoutMs }) {
  return new Promise((resolve) => {
    const command = buildCommand(engine, instruction);

    const child = spawn(command, {
      cwd: worktreePath,
      shell: true,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: `${stderr}\n${error.message}`, timedOut });
    });
  });
}

async function executeCodeChangeProposal(db, { pendingActionId, instruction, repoPath, engine = DEFAULT_ENGINE }) {
  await ensureDiffResultColumn(db);

  const numericId = Number(pendingActionId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, http_status: 400, error: `Invalid pendingActionId "${pendingActionId}".` };
  }

  const resolvedEngine = String(engine || DEFAULT_ENGINE).toLowerCase();
  if (!ENGINES.includes(resolvedEngine)) {
    return { ok: false, http_status: 400, error: `Unsupported engine "${engine}". Must be one of: ${ENGINES.join(', ')}.` };
  }

  if (!isAllowedRepoPath(repoPath)) {
    return { ok: false, http_status: 400, error: `repoPath "${repoPath}" is not in the allowed list.` };
  }

  if (!instruction || !String(instruction).trim()) {
    return { ok: false, http_status: 400, error: 'instruction is required.' };
  }

  const existing = await pendingActionsService.getPendingActionById(db, numericId);
  if (!existing) {
    return { ok: false, http_status: 404, error: `pending_actions row ${numericId} not found.` };
  }
  if (existing.status !== 'approved') {
    return { ok: false, http_status: 400, error: '제안이 승인 상태가 아닙니다.' };
  }
  if (existing.action_type !== 'code_change_proposal') {
    return { ok: false, http_status: 400, error: `Unsupported action_type "${existing.action_type}" for code execution.` };
  }

  if (executionInProgress) {
    return { ok: false, http_status: 409, error: '이미 실행 중인 code-execution 작업이 있습니다. 완료 후 다시 시도해주세요.' };
  }
  executionInProgress = true;

  const resolvedRepoPath = path.resolve(repoPath);
  const branchName = `exec-${numericId}-${Date.now()}`;
  const worktreePath = worktreePathFor(resolvedRepoPath, branchName);

  let worktreeCreated = false;

  try {
    execSync(`git worktree add -b "${branchName}" "${worktreePath}"`, { cwd: resolvedRepoPath, stdio: 'pipe' });
    worktreeCreated = true;

    const runResult = await runEngineHeadless({ engine: resolvedEngine, worktreePath, instruction, timeoutMs: DEFAULT_TIMEOUT_MS });

    let diffText = '';
    try {
      // `git diff` never shows untracked files on its own - stage everything first (the
      // worktree gets deleted right after anyway, so this has no lasting effect) so a
      // brand-new file Claude created but didn't commit still shows up in the captured diff.
      execSync('git add -A', { cwd: worktreePath, stdio: 'pipe' });
      diffText = execSync('git diff main --cached', { cwd: worktreePath, maxBuffer: 20 * 1024 * 1024 }).toString();
    } catch (diffError) {
      diffText = `[diff capture failed] ${diffError.message}`;
    }

    const noteLines = [
      `[execute-code] engine=${resolvedEngine} branch=${branchName} exit_code=${runResult.exitCode} timed_out=${runResult.timedOut}`,
      `--- stdout (truncated) ---`,
      truncate(runResult.stdout),
      `--- stderr (truncated) ---`,
      truncate(runResult.stderr)
    ];

    await db.query(
      `UPDATE pending_actions SET status = 'executed', review_note = ?, diff_result = ? WHERE id = ?`,
      [noteLines.join('\n'), diffText, numericId]
    );

    return {
      ok: true,
      action: await pendingActionsService.getPendingActionById(db, numericId),
      engine: resolvedEngine,
      branch_name: branchName,
      exit_code: runResult.exitCode,
      timed_out: runResult.timedOut,
      diff: diffText
    };
  } catch (error) {
    await db.query(
      `UPDATE pending_actions SET status = 'failed', review_note = ? WHERE id = ?`,
      [`[execute-code_failed] ${error.message}`, numericId]
    );
    return {
      ok: false,
      action: await pendingActionsService.getPendingActionById(db, numericId),
      error: error.message
    };
  } finally {
    if (worktreeCreated) {
      try {
        execSync(`git worktree remove --force "${worktreePath}"`, { cwd: resolvedRepoPath, stdio: 'pipe' });
      } catch (_) {
        // Best-effort - if this fails the worktree directory is orphaned but the branch
        // (and the captured diff already saved to the DB) are unaffected.
      }
    }
    executionInProgress = false;
  }
}

module.exports = {
  ALLOWED_REPO_PATHS,
  ENGINES,
  isAllowedRepoPath,
  checkEngineAvailability,
  executeCodeChangeProposal
};
