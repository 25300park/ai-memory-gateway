'use strict';

// Canary test file for verifying git worktree isolation + headless Claude Code
// execution safety (Phase 20). Intentional bug below: `-` should be `+`.
function addNumbers(a, b) {
  return a - b;
}

module.exports = { addNumbers };
