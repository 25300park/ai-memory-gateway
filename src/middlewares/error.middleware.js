const { fail } = require("../utils/response.util");
const { isDbConnectionError, buildDbConnectionErrorMessage } = require("../utils/db-error-hint.util");
const { maskUrlToken } = require("../utils/mask-url.util");

function notFoundHandler(req, res, next) {
  return fail(res, {
    code: "ROUTE_NOT_FOUND",
    message: `Route not found: ${req.method} ${maskUrlToken(req.originalUrl)}`,
    statusCode: 404,
    details: {
      request_id: req.requestId || null
    },
    req,
    source: "notFoundHandler"
  });
}

function errorHandler(error, req, res, next) {
  console.error("Unhandled error:", {
    request_id: req.requestId || null,
    method: req.method,
    url: maskUrlToken(req.originalUrl),
    code: error.code || null,
    message: error.message,
    stack: error.stack
  });

  // Keep code/statusCode exactly as before - only the message gets a human-readable hint
  // prepended, so existing consumers that branch on error.code/http_status see no change.
  const message = isDbConnectionError(error)
    ? buildDbConnectionErrorMessage(error)
    : (error.message || "An unexpected error occurred.");

  return fail(res, {
    code: error.code || "INTERNAL_ERROR",
    message,
    statusCode: error.statusCode || 500,
    details: {
      request_id: req.requestId || null,
      error_details: error.details || null,
      stack: process.env.NODE_ENV === "development" ? error.stack : null
    },
    req,
    source: error.source || "globalErrorHandler",
    exposeDetails: error.exposeDetails
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
