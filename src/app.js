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
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  }
}));
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

app.use("/ai", aiRateLimiter, adminApiAuthMiddleware, aiRoutes);

// 404 handler: 등록되지 않은 route 처리
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;