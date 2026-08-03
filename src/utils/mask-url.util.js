// Prevents admin tokens passed via the deprecated ?token= query string from being written
// to logs in plaintext when a request is logged or hits the error handler.
function maskUrlToken(url) {
  return String(url || "").replace(/token=[^&]+/i, "token=***");
}

module.exports = { maskUrlToken };
