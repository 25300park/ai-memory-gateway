'use strict';

/**
 * Read-only tools for the Personal AI Agent to query the MRHOMES_CRM Supabase
 * Postgres database (via ai_agent_listings_view, which is exempt from the PMS
 * tenant/owner RLS policy that blocks the plain `listings` table for this role).
 */

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.MRHOMES_CRM_DB_URL;
    if (!connectionString) {
      throw new Error('MRHOMES_CRM_DB_URL is not set in .env');
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

async function searchListings({ keyword, code, transaction_type, min_price, max_price, limit } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 20));
  const conditions = [];
  const params = [];

  if (code) {
    params.push(code);
    conditions.push(`code = $${params.length}`);
  }

  if (keyword) {
    params.push(`%${keyword}%`);
    conditions.push(`(name ILIKE $${params.length} OR address ILIKE $${params.length})`);
  }

  if (transaction_type) {
    params.push(transaction_type);
    conditions.push(`transaction_type = $${params.length}`);
  }

  if (min_price !== undefined && min_price !== null && min_price !== '') {
    params.push(min_price);
    conditions.push(`price >= $${params.length}`);
  }

  if (max_price !== undefined && max_price !== null && max_price !== '') {
    params.push(max_price);
    conditions.push(`price <= $${params.length}`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(safeLimit);

  const sql = `
    SELECT id, code, name, address, transaction_type, property_type, price, status,
           COUNT(*) OVER() AS total_matching_count
    FROM ai_agent_listings_view
    ${whereSql}
    ORDER BY code DESC
    LIMIT $${params.length};
  `;

  const client = getPool();
  const result = await client.query(sql, params);
  const totalMatchingCount = result.rows.length > 0 ? Number(result.rows[0].total_matching_count) : 0;
  const listings = result.rows.map(({ total_matching_count, ...row }) => row);

  return {
    listings,
    total_matching_count: totalMatchingCount,
    returned_count: listings.length
  };
}

module.exports = { searchListings };
