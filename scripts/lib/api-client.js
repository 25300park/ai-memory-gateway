'use strict';

/**
 * Shared client for scripts that talk to this API's own /ai/agent/* routes.
 *
 * Always uses Node's fetch directly and passes question text as a JS string
 * (never through a shell argument), for the same reason test-ask.js already
 * did this: Korean/non-ASCII text going through a shell risks cp949/UTF-8
 * mojibake on Windows.
 */

const path = require('path');

let cachedEnv = null;

function loadEnv() {
  if (cachedEnv) return cachedEnv;

  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

  const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3010}`;
  const adminToken = process.env.ADMIN_TOKEN || '';

  if (!adminToken) {
    console.warn('Warning: ADMIN_TOKEN is not set in .env - requests to /ai/* will likely fail with 401.');
  }

  cachedEnv = { baseUrl, adminToken };
  return cachedEnv;
}

async function postJson(endpoint, payload) {
  const { baseUrl, adminToken } = loadEnv();

  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-admin-token': adminToken
    },
    body: JSON.stringify(payload)
  });

  const body = await res.json();
  return { http_status: res.status, body };
}

// options may include: project_code, provider, live, enable_crm_tool,
// enable_github_tool, enable_write_proposals, context_limit, ... - passed
// straight through as extra body fields.
async function callAgentAsk(question, options = {}) {
  return postJson('/ai/agent/ask', { question, ...options });
}

// options may include: project_code, max_rounds. confirm_live is always
// forced true here since /ai/agent/collab always makes real provider calls.
async function callAgentCollab(question, options = {}) {
  return postJson('/ai/agent/collab', { question, ...options, confirm_live: true });
}

module.exports = {
  loadEnv,
  callAgentAsk,
  callAgentCollab
};
