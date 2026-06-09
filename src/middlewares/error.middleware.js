const { fail } = require("../utils/response.util");

function notFoundHandler(req, res, next) {
  return fail(res, {
    code: "ROUTE_NOT_FOUND",
    message: `Route not found: ${req.method} ${req.originalUrl}`,
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
    url: req.originalUrl,
    code: error.code || null,
    message: error.message,
    stack: error.stack
  });

  return fail(res, {
    code: error.code || "INTERNAL_ERROR",
    message: error.message || "An unexpected error occurred.",
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
