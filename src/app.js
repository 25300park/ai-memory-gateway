const express = require("express");
const cors = require("cors");
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

app.set("json replacer", (key, value) =>
  typeof value === "bigint" ? value.toString() : value
);

app.use(cors());
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

app.use("/ai", aiRoutes);

// 404 handler: 등록되지 않은 route 처리
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;