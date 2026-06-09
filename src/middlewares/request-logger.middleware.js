const crypto = require("crypto");

function requestLogger(req, res, next) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  req.requestId = requestId;

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;

    const log = {
      request_id: requestId,
      method: req.method,
      url: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: durationMs,
      ip: req.ip,
      user_agent: req.headers["user-agent"] || null,
      timestamp: new Date().toISOString()
    };

    if (res.statusCode >= 500) {
      console.error("[API ERROR]", log);
    } else if (res.statusCode >= 400) {
      console.warn("[API WARN]", log);
    } else {
      console.log("[API]", log);
    }
  });

  next();
}

module.exports = {
  requestLogger
};