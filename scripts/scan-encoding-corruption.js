'use strict';

/**
 * Phase 19: read-only scan for mojibake (U+FFFD replacement-character corruption)
 * across every text-like column in the database. Reuses the same detector the app
 * already uses at write time (src/utils/encoding-corruption.util.js) so "corrupted"
 * means the same thing here as it does in the server's own encoding-corruption
 * warnings. This script never writes/deletes anything - it only reports.
 *
 * Usage:
 *   node scripts/scan-encoding-corruption.js
 */

const pool = require('../src/config/db');
const { detectEncodingCorruption } = require('../src/utils/encoding-corruption.util');

const TEXT_TYPES = ['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext'];

async function getTextColumns(db) {
  const [rows] = await db.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND data_type IN (${TEXT_TYPES.map(() => '?').join(',')})
     ORDER BY table_name, ordinal_position`,
    TEXT_TYPES
  );
  return rows.map((r) => ({ table: r.TABLE_NAME ?? r.table_name, column: r.COLUMN_NAME ?? r.column_name }));
}

async function getPrimaryKeyColumn(db, table) {
  const [rows] = await db.query(
    `SELECT column_name
     FROM information_schema.key_column_usage
     WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = 'PRIMARY'
     ORDER BY ordinal_position
     LIMIT 1`,
    [table]
  );
  const col = rows[0]?.COLUMN_NAME ?? rows[0]?.column_name;
  return col || 'id';
}

function truncate(text, length = 30) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

async function scanColumn(db, table, column, pkColumn) {
  const findings = [];
  let rows;
  try {
    [rows] = await db.query(
      `SELECT \`${pkColumn}\` AS pk, \`${column}\` AS val FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`
    );
  } catch (error) {
    return { findings, error: error.message };
  }

  for (const row of rows) {
    const result = detectEncodingCorruption(row.val);
    if (result.corrupted) {
      findings.push({
        table,
        column,
        pk_column: pkColumn,
        id: row.pk,
        ratio: result.ratio,
        replacement_char_count: result.replacement_char_count,
        preview: truncate(row.val)
      });
    }
  }

  return { findings, error: null };
}

async function main() {
  console.log('=== 인코딩 오염(mojibake) 스캔 (읽기 전용, 삭제/수정 없음) ===\n');

  const columns = await getTextColumns(pool);
  console.log(`검사 대상: ${columns.length}개 컬럼 (전체 테이블의 varchar/char/text 계열)\n`);

  const pkCache = new Map();
  const allFindings = [];
  const columnErrors = [];

  for (const { table, column } of columns) {
    if (!pkCache.has(table)) {
      pkCache.set(table, await getPrimaryKeyColumn(pool, table));
    }
    const pkColumn = pkCache.get(table);

    const { findings, error } = await scanColumn(pool, table, column, pkColumn);
    if (error) {
      columnErrors.push({ table, column, error });
      continue;
    }
    allFindings.push(...findings);
  }

  if (columnErrors.length) {
    console.log('--- 스캔 중 오류(건너뜀) ---');
    columnErrors.forEach((e) => console.log(`  ${e.table}.${e.column}: ${e.error}`));
    console.log('');
  }

  if (allFindings.length === 0) {
    console.log('오염 의심 데이터가 발견되지 않았습니다.');
    process.exit(0);
  }

  console.log(`총 ${allFindings.length}건의 오염 의심 행 발견:\n`);

  const colWidths = { table: 30, column: 20, id: 10, ratio: 8 };
  const header = `${'테이블'.padEnd(colWidths.table)} ${'컬럼'.padEnd(colWidths.column)} ${'id'.padEnd(colWidths.id)} ${'오염비율'.padEnd(colWidths.ratio)} 미리보기(앞 30자)`;
  console.log(header);
  console.log('-'.repeat(header.length + 20));

  for (const f of allFindings) {
    console.log(
      `${String(f.table).padEnd(colWidths.table)} ${String(f.column).padEnd(colWidths.column)} ${String(f.id).padEnd(colWidths.id)} ${(f.ratio * 100).toFixed(1).padStart(5)}%   ${f.preview}`
    );
  }

  console.log('\n--- 테이블별 요약 ---');
  const byTable = new Map();
  for (const f of allFindings) {
    const key = `${f.table}.${f.column}`;
    byTable.set(key, (byTable.get(key) || 0) + 1);
  }
  for (const [key, count] of byTable.entries()) {
    console.log(`  ${key}: ${count}건`);
  }

  console.log('\n(삭제/수정하지 않았습니다 - 보고만 했습니다.)');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('스캔 실패:', error.message);
    process.exit(1);
  });
