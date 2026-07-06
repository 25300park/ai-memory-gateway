'use strict';

/**
 * Standalone test helper for POST /ai/agent/ask.
 *
 * Sends the request directly via Node's fetch instead of curl/bash, so
 * Korean (or any non-ASCII) question text never passes through a shell
 * and cannot be mangled by the terminal's codepage (the cp949/UTF-8
 * mojibake issue this repo has hit repeatedly when testing through curl
 * on Windows).
 *
 * Usage:
 *   node scripts/test-ask.js "질문 내용" [provider] [live] [enable_crm_tool] [project_code]
 *
 * Examples:
 *   node scripts/test-ask.js "안녕하세요"
 *   node scripts/test-ask.js "이 함수의 버그를 고쳐줘" anthropic true
 *   node scripts/test-ask.js "BGC 지역에 있는 매물 좀 찾아줘" anthropic true true rbs_homes
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const question = process.argv[2];
const provider = process.argv[3] || 'auto';
const live = process.argv[4] === 'true';
const enableCrmTool = process.argv[5] === 'true';
const projectCode = process.argv[6];

if (!question) {
  console.error('Usage: node scripts/test-ask.js "질문 내용" [provider] [live] [enable_crm_tool] [project_code]');
  process.exit(1);
}

const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3010}`;
const adminToken = process.env.ADMIN_TOKEN || '';

async function main() {
  const res = await fetch(`${baseUrl}/ai/agent/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-admin-token': adminToken
    },
    body: JSON.stringify({
      question,
      provider,
      live,
      enable_crm_tool: enableCrmTool,
      project_code: projectCode
    })
  });

  const body = await res.json();

  console.log(`HTTP ${res.status}`);
  console.log('ok:', body.ok);
  console.log('question_type:', body.question_type);
  console.log('provider_requested:', body.provider_requested);
  console.log('provider_used:', body.provider_used);
  console.log('interaction_id:', body.interaction_id);
  console.log('crm_tool_used:', body.crm_tool_used);
  console.log('crm_tool_audit:', JSON.stringify(body.crm_tool_audit));
  console.log('answer:', body.answer);
  console.log('');
  console.log('--- full response ---');
  console.log(JSON.stringify(body, null, 2));
}

main().catch((error) => {
  console.error('Request failed:', error.message);
  process.exit(1);
});
