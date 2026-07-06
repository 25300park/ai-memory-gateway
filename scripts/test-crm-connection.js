'use strict';

/**
 * One-off connectivity check for the MRHOMES_CRM Supabase Postgres database.
 *
 * Read-only: runs a single SELECT with LIMIT 1 against `listings` and exits.
 * Does not touch any application code - safe to re-run any time to confirm
 * the ai_readonly_agent role can still reach the CRM database.
 *
 * Usage:
 *   node scripts/test-crm-connection.js
 */

const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectionString = process.env.MRHOMES_CRM_DB_URL;

if (!connectionString) {
  console.error('MRHOMES_CRM_DB_URL is not set in .env');
  process.exit(1);
}

async function tryQuery(client) {
  await client.connect();
  const result = await client.query('SELECT id, code, name, address, price, status FROM ai_agent_listings_view LIMIT 1;');
  return result.rows;
}

async function main() {
  let client = new Client({ connectionString });

  try {
    const rows = await tryQuery(client);
    console.log('Connected without SSL override.');
    console.log(JSON.stringify(rows, null, 2));
    await client.end();
    return;
  } catch (error) {
    console.warn('Initial connection attempt failed, retrying with ssl: { rejectUnauthorized: false }.');
    console.warn('Original error:', error.message);
    try {
      await client.end();
    } catch (_) {
      // client may not have connected at all; ignore
    }
  }

  client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    const rows = await tryQuery(client);
    console.log('Connected with ssl: { rejectUnauthorized: false }.');
    console.log(JSON.stringify(rows, null, 2));
  } catch (error) {
    console.error('Connection failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
