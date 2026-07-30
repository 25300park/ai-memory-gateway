'use strict';

/**
 * One-shot infra health check: NAS ping, Tailscale peer status, current DB_HOST,
 * a live DB connection test against it (plus a reference test against the NAS if
 * DB_HOST isn't already the NAS), local port availability, and a sanity check that
 * this is actually being run from the project root.
 *
 * Read-only - never writes anywhere, never changes .env or DB state.
 *
 * Usage: node scripts/diagnose.js
 */

const { exec } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const NAS_HOST = '192.168.0.5';
const TAILSCALE_HOSTNAME = 'mrhomes-server-2026';
const PORTS_TO_CHECK = [
  { port: 3010, label: 'api' },
  { port: 3000, label: 'console' },
  { port: 3001, label: 'console' }
];

function execPromise(cmd, timeoutMs) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

// Windows ping keeps "TTL=" as a literal ASCII token even under a Korean-locale OS
// (only the surrounding labels get mojibake'd through this shell's codepage), so this
// regex survives locale garbling in a way that matching "Average"/"평균" would not.
async function checkPing() {
  const cmd = process.platform === 'win32' ? `ping -n 4 ${NAS_HOST}` : `ping -c 4 ${NAS_HOST}`;
  const { error, stdout } = await execPromise(cmd, 10000);
  const replyTimes = [...stdout.matchAll(/=(\d+)ms\s*TTL=/gi)].map((m) => Number(m[1]));
  const ok = !error && replyTimes.length > 0;
  if (ok) {
    const avg = Math.round(replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length);
    return { ok: true, label: `ping ${NAS_HOST} (NAS)`, detail: `avg ${avg}ms (${replyTimes.length}/4 replies)` };
  }
  return { ok: false, label: `ping ${NAS_HOST} (NAS)`, detail: '응답 없음 / 타임아웃' };
}

async function checkTailscale() {
  const { error, stdout, stderr } = await execPromise('tailscale status', 8000);
  if (error && !stdout) {
    return { ok: false, label: 'tailscale status', detail: `tailscale 실행 실패: ${String(stderr || error.message).split('\n')[0]}` };
  }
  const line = stdout.split('\n').find((l) => l.includes(TAILSCALE_HOSTNAME));
  if (!line) {
    return { ok: false, label: `tailscale (${TAILSCALE_HOSTNAME})`, detail: 'status 출력에서 호스트를 찾을 수 없음' };
  }
  const isOffline = /offline/i.test(line);
  return {
    ok: !isOffline,
    label: `tailscale (${TAILSCALE_HOSTNAME})`,
    detail: isOffline ? line.trim() : line.trim()
  };
}

function checkEnvDbHost() {
  const dbHost = (process.env.DB_HOST || '').trim();
  return { ok: Boolean(dbHost), label: '.env DB_HOST', detail: dbHost || '(설정되지 않음)' };
}

async function testDbConnection(host, label) {
  const mariadb = require('mariadb');
  const start = Date.now();
  let conn;
  try {
    conn = await mariadb.createConnection({
      host,
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_NAME ? process.env.DB_NAME.trim() : undefined,
      user: process.env.DB_USER ? process.env.DB_USER.trim() : undefined,
      password: process.env.DB_PASSWORD,
      connectTimeout: 5000,
      socketTimeout: 5000,
      ssl: false
    });
    await conn.query('SELECT 1');
    return { ok: true, label, detail: `연결 성공 (${Date.now() - start}ms)` };
  } catch (error) {
    return { ok: false, label, detail: `${error.code || error.message} (${Date.now() - start}ms)` };
  } finally {
    if (conn) {
      try { await conn.end(); } catch (_) { /* ignore */ }
    }
  }
}

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1', timeout: 1500 });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function checkPorts() {
  const results = [];
  for (const { port, label } of PORTS_TO_CHECK) {
    const listening = await checkPort(port);
    results.push({ ok: listening, label: `port ${port} (${label})`, detail: listening ? 'LISTENING' : '비어있음' });
  }
  return results;
}

function checkCwd() {
  const pkgPath = path.join(process.cwd(), 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const ok = pkg.name === 'ai-memory-gateway';
    return {
      ok,
      label: 'process.cwd() 프로젝트 확인',
      detail: ok ? `${process.cwd()} (name=${pkg.name})` : `package.json name="${pkg.name}" - 다른 프로젝트일 수 있음`
    };
  } catch (error) {
    return { ok: false, label: 'process.cwd() 프로젝트 확인', detail: `package.json을 읽을 수 없음: ${error.message}` };
  }
}

function printResult(result) {
  console.log(`${result.ok ? '✅' : '❌'} ${result.label}: ${result.detail}`);
}

async function main() {
  console.log('=== 인프라 진단 (scripts/diagnose.js) ===\n');

  const cwd = checkCwd();
  printResult(cwd);

  const ping = await checkPing();
  printResult(ping);

  const tailscale = await checkTailscale();
  printResult(tailscale);

  const dbHostEnv = checkEnvDbHost();
  printResult(dbHostEnv);

  const dbHost = (process.env.DB_HOST || '').trim();
  const dbConn = await testDbConnection(dbHost || '127.0.0.1', `DB 연결 (${dbHost || '127.0.0.1'})`);
  printResult(dbConn);

  // Skip only when DB_HOST already IS the NAS (step d already covered it) - run this
  // reference check whenever we're on the local fallback so recovery gets noticed,
  // and also for any other non-NAS host as a general sanity check.
  let nasConn = null;
  if (dbHost !== NAS_HOST) {
    nasConn = await testDbConnection(NAS_HOST, `DB 연결 참고용 (NAS ${NAS_HOST})`);
    printResult(nasConn);
  }

  const ports = await checkPorts();
  ports.forEach(printResult);

  console.log('\n=== 종합 진단 ===');
  const suggestions = [];

  if (!cwd.ok) {
    suggestions.push('현재 디렉토리가 이 프로젝트(api) 루트가 아닌 것 같습니다. cd 후 다시 실행하세요.');
  }

  const usingLocalDb = dbHost === '127.0.0.1' || dbHost === 'localhost';
  if (usingLocalDb) {
    suggestions.push(
      dbConn.ok
        ? '로컬 DB로 정상 동작 중입니다.'
        : '로컬 DB(127.0.0.1) 연결 실패 - MySQL 서비스가 켜져 있는지, .env 계정정보가 맞는지 확인하세요.'
    );
    if (nasConn) {
      suggestions.push(
        nasConn.ok
          ? 'NAS(192.168.0.5) DB 연결이 복구된 것으로 보입니다 - .env의 DB_HOST를 NAS로 되돌릴지 검토하세요.'
          : 'NAS 연결 안 됨 → 로컬 DB 유지 중, 정상.'
      );
    }
  } else if (dbConn.ok) {
    suggestions.push(`DB_HOST(${dbHost})로 정상 연결됩니다.`);
  } else {
    suggestions.push(`현재 설정된 DB_HOST(${dbHost})에 연결할 수 없습니다 - 미니PC/NAS가 꺼져있거나 Tailscale이 끊겼을 수 있습니다.`);
  }

  if (!ping.ok) {
    suggestions.push('NAS(192.168.0.5) ping 실패 - 네트워크 또는 NAS 전원을 확인하세요.');
  }
  if (!tailscale.ok) {
    suggestions.push(`Tailscale에서 ${TAILSCALE_HOSTNAME}이(가) offline이거나 확인 불가 - 원격 DB/서버 접근이 필요하면 Tailscale 연결을 확인하세요.`);
  }

  const apiPort = ports.find((r) => r.label.startsWith('port 3010'));
  suggestions.push(apiPort.ok ? 'API 서버(3010) 실행 중입니다.' : '포트 3010 비어있음 → node src/server.js 실행 필요.');

  const consolePorts = ports.filter((r) => r.label.includes('console'));
  if (consolePorts.every((r) => !r.ok)) {
    suggestions.push('콘솔(3000/3001) 서버가 꺼져있는 것으로 보입니다 - 필요하면 콘솔 프로젝트를 실행하세요.');
  }

  suggestions.forEach((s) => console.log(`- ${s}`));
}

main().catch((error) => {
  console.error('진단 스크립트 실행 중 오류:', error);
  process.exit(1);
});
