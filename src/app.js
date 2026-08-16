const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const aiRoutes = require("./routes/ai.routes");
const pool = require("./config/db");
const app = express();
const {
  notFoundHandler,
  errorHandler
} = require("./middlewares/error.middleware");
const { requestLogger } = require("./middlewares/request-logger.middleware");
const path = require("path");
const adminAuthMiddleware = require("./middlewares/admin-auth.middleware");
const adminApiAuthMiddleware = require("./middlewares/admin-api-auth.middleware");

app.set("json replacer", (key, value) =>
  typeof value === "bigint" ? value.toString() : value
);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const generalCors = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  }
});

// Phase 22-8: the browser now uploads export files directly to these two endpoints (via a
// short-lived upload token, not the admin token) instead of the file bytes routing through
// the console's Vercel proxy - that means these two paths need real browser CORS from the
// console's own origin, which the rest of /ai/* deliberately does not grant. Scoped to just
// these paths (not folded into ALLOWED_ORIGINS) so a console-origin browser still can't
// CORS-call any other admin endpoint.
const UPLOAD_PATHS = ["/ai/imports/chatgpt/import", "/ai/imports/gemini-claude/import"];
const consoleOrigins = (process.env.CONSOLE_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
const uploadCors = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || consoleOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  }
});

app.use((req, res, next) => {
  if (UPLOAD_PATHS.includes(req.path)) return uploadCors(req, res, next);
  return generalCors(req, res, next);
});
app.use(express.json({ limit: "5mb" }));
app.use(requestLogger);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ai-memory-gateway"
  });
});

app.get("/health/db", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DATABASE() AS db_name, NOW() AS server_time");

    res.json({
      ok: true,
      db: rows[0]
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.use("/admin", adminAuthMiddleware, express.static(path.join(__dirname, "public/admin")));

// Env-configurable so rate-limit testing (e.g. temporarily setting the limit to 5) doesn't
// require a code change/revert cycle.
const aiRateLimiter = rateLimit({
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.AI_RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests to /ai. Please wait before retrying."
    }
  }
});

// Phase 22-8: the two upload endpoints authenticate the browser with a short-lived upload
// token instead of the admin token (see upload-tokens.service.js / ai.routes.js), so they're
// excluded from the blanket adminApiAuthMiddleware requirement here and validate their own
// auth inline. req.path is already router-relative at this point (Express strips the "/ai"
// mount prefix for everything passed to app.use("/ai", ...)), unlike the CORS check above
// which runs before any mounting and so matches on the full "/ai/..." path.
const UPLOAD_PATHS_RELATIVE = ["/imports/chatgpt/import", "/imports/gemini-claude/import"];
app.use("/ai", aiRateLimiter, (req, res, next) => {
  if (UPLOAD_PATHS_RELATIVE.includes(req.path)) return next();
  return adminApiAuthMiddleware(req, res, next);
}, aiRoutes);

// 404 handler: 등록되지 않은 route 처리
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;