"use strict";

// Error codes that mean "couldn't reach the DB server at all" (as opposed to a query/schema
// problem once connected). These are the raw codes mariadb/Node surface for a dead NAS/mini PC
// or a broken Tailscale link, not something the app itself controls.
const DB_CONNECTION_ERROR_CODES = new Set([
  "ER_GET_CONNECTION_TIMEOUT",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "PROTOCOL_CONNECTION_LOST"
]);

function isDbConnectionError(error) {
  return Boolean(error && DB_CONNECTION_ERROR_CODES.has(error.code));
}

function buildDbConnectionErrorMessage(error) {
  const originalMessage = error?.message || String(error || "Unknown error");
  return `DB 서버(NAS/미니PC)에 연결할 수 없습니다. 미니PC가 꺼져있거나 Tailscale 연결이 끊겼을 수 있습니다. (원본 에러: ${originalMessage})`;
}

module.exports = {
  DB_CONNECTION_ERROR_CODES,
  isDbConnectionError,
  buildDbConnectionErrorMessage
};
