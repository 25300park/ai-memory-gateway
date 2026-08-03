const { maskUrlToken } = require("../utils/mask-url.util");

const ERROR_CATALOG = [
  {
    code: "VALIDATION_ERROR",
    http_status: 400,
    type: "client_error",
    severity: "low",
    message: "The request body, query, or parameter is invalid.",
    operator_action: "Check the request fields and retry."
  },
  {
    code: "ADMIN_TOKEN_MISSING",
    http_status: 401,
    type: "auth_error",
    severity: "medium",
    message: "Admin token is required.",
    operator_action: "Send x-admin-token header or use /admin?token=..."
  },
  {
    code: "ADMIN_TOKEN_INVALID",
    http_status: 403,
    type: "auth_error",
    severity: "high",
    message: "Admin token is invalid.",
    operator_action: "Use a valid primary or secondary admin token."
  },
  {
    code: "PERMISSION_DENIED",
    http_status: 403,
    type: "permission_error",
    severity: "high",
    message: "The current admin role cannot perform this action.",
    operator_action: "Use an admin role with the required permission."
  },
  {
    code: "DANGEROUS_ACTION_CONFIRMATION_REQUIRED",
    http_status: 409,
    type: "safety_error",
    severity: "high",
    message: "This dangerous action requires explicit confirmation.",
    operator_action: "Send confirm_action and confirm_text with the exact action key."
  },
  {
    code: "PENDING_ACTION_NOT_FOUND",
    http_status: 404,
    type: "client_error",
    severity: "low",
    message: "The requested pending_actions row does not exist.",
    operator_action: "Check the action id and retry."
  },
  {
    code: "ROUTE_NOT_FOUND",
    http_status: 404,
    type: "routing_error",
    severity: "low",
    message: "The requested route does not exist.",
    operator_action: "Check the HTTP method and URL path."
  },
  {
    code: "PROVIDER_CALL_FAILED",
    http_status: 502,
    type: "provider_error",
    severity: "medium",
    message: "The selected AI provider call failed.",
    operator_action: "Check provider live status, model id, API key, quota, and fallback settings."
  },
  {
    code: "DB_QUERY_FAILED",
    http_status: 500,
    type: "database_error",
    severity: "high",
    message: "A database query failed.",
    operator_action: "Check DB connectivity, schema compatibility, and server logs."
  },
  {
    code: "INTERNAL_ERROR",
    http_status: 500,
    type: "server_error",
    severity: "high",
    message: "An unexpected server error occurred.",
    operator_action: "Check request_id in server logs and operation logs."
  }
];

function nowIso() {
  return new Date().toISOString();
}

function getErrorCatalogEntry(code) {
  return ERROR_CATALOG.find((entry) => entry.code === code) || ERROR_CATALOG.find((entry) => entry.code === "INTERNAL_ERROR");
}

function getRequestId(req) {
  return req?.requestId || req?.headers?.["x-request-id"] || null;
}

function normalizeDetails(details) {
  if (details === undefined) return null;
  if (details === null) return null;
  return details;
}

function buildStandardError({
  req = null,
  code = "INTERNAL_ERROR",
  message = null,
  statusCode = null,
  details = null,
  hint = null,
  source = null,
  exposeDetails = null
} = {}) {
  const catalog = getErrorCatalogEntry(code);
  const resolvedStatusCode = Number(statusCode || catalog.http_status || 500);
  const isProduction = process.env.NODE_ENV === "production";
  const shouldExposeDetails = exposeDetails === null ? !isProduction : Boolean(exposeDetails);

  return {
    ok: false,
    error: {
      code: code || "INTERNAL_ERROR",
      message: message || catalog.message || "An unexpected error occurred.",
      type: catalog.type || "server_error",
      severity: catalog.severity || "medium",
      http_status: resolvedStatusCode,
      request_id: getRequestId(req),
      timestamp: nowIso(),
      path: maskUrlToken(req?.originalUrl || req?.url) || null,
      method: req?.method || null,
      source: source || null,
      operator_action: hint || catalog.operator_action || null,
      details: shouldExposeDetails ? normalizeDetails(details) : null
    }
  };
}

function sendStandardError(res, options = {}) {
  const payload = buildStandardError(options);
  const statusCode = payload.error.http_status || options.statusCode || 500;
  return res.status(statusCode).json(payload);
}

function createApiError({ code = "INTERNAL_ERROR", message, statusCode, details, exposeDetails } = {}) {
  const error = new Error(message || getErrorCatalogEntry(code)?.message || "An unexpected error occurred.");
  error.code = code;
  error.statusCode = statusCode || getErrorCatalogEntry(code)?.http_status || 500;
  error.details = details || null;
  error.exposeDetails = exposeDetails;
  return error;
}

function getApiErrorStandardStatus() {
  const productionMode = process.env.NODE_ENV === "production";

  return {
    ok: true,
    phase: "12-4",
    standard_name: "AI Memory Gateway Standard API Error Response",
    status: "ACTIVE",
    production_mode: productionMode,
    response_shape: {
      ok: false,
      error: {
        code: "STRING_ERROR_CODE",
        message: "Human-readable message",
        type: "client_error | auth_error | permission_error | provider_error | database_error | server_error",
        severity: "low | medium | high",
        http_status: "HTTP status code",
        request_id: "Request id when available",
        timestamp: "ISO timestamp",
        path: "Request path",
        method: "HTTP method",
        source: "Subsystem or middleware name",
        operator_action: "Recommended operator action",
        details: productionMode ? null : "Debug details in non-production mode"
      }
    },
    policies: {
      validation_error_status: 400,
      missing_token_status: 401,
      invalid_token_status: 403,
      route_not_found_status: 404,
      dangerous_confirmation_status: 409,
      provider_failure_status: 502,
      internal_error_status: 500,
      hide_stack_in_production: true
    }
  };
}

function getApiErrorCatalog() {
  return {
    ok: true,
    phase: "12-4",
    count: ERROR_CATALOG.length,
    error_catalog: ERROR_CATALOG
  };
}

function getApiErrorExamples() {
  const samples = [
    buildStandardError({ code: "VALIDATION_ERROR", message: "project_code is required.", details: { field: "project_code" }, source: "example" }),
    buildStandardError({ code: "ADMIN_TOKEN_MISSING", source: "admin-api-auth.middleware" }),
    buildStandardError({ code: "DANGEROUS_ACTION_CONFIRMATION_REQUIRED", details: { required_confirm_text: "DRAIN_SUMMARY_QUEUE" }, source: "dangerous-action.service" }),
    buildStandardError({ code: "PROVIDER_CALL_FAILED", details: { provider: "openai", model: "gpt-5.5" }, source: "model-provider.service" })
  ];

  return {
    ok: true,
    phase: "12-4",
    examples: samples
  };
}

function runApiErrorResponseTest({ req, scenario = "validation" } = {}) {
  const normalizedScenario = String(scenario || "validation").toLowerCase();

  const scenarioMap = {
    validation: {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      message: "This is a standardized validation error test.",
      details: { scenario: normalizedScenario, field: "sample_field" },
      source: "api-error-test"
    },
    permission: {
      code: "PERMISSION_DENIED",
      statusCode: 403,
      message: "This is a standardized permission error test.",
      details: { required_permission: "system:dangerous_action" },
      source: "api-error-test"
    },
    dangerous: {
      code: "DANGEROUS_ACTION_CONFIRMATION_REQUIRED",
      statusCode: 409,
      message: "This is a standardized dangerous action confirmation error test.",
      details: { required_confirm_text: "TEST_DANGEROUS_CONFIRMATION" },
      source: "api-error-test"
    },
    provider: {
      code: "PROVIDER_CALL_FAILED",
      statusCode: 502,
      message: "This is a standardized provider failure test.",
      details: { provider: "mock", route_status: "SIMULATED_PROVIDER_FAILURE" },
      source: "api-error-test"
    },
    internal: {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      message: "This is a standardized internal error test.",
      details: { simulated: true },
      source: "api-error-test"
    }
  };

  return buildStandardError({ req, ...(scenarioMap[normalizedScenario] || scenarioMap.validation) });
}

module.exports = {
  ERROR_CATALOG,
  buildStandardError,
  sendStandardError,
  createApiError,
  getApiErrorStandardStatus,
  getApiErrorCatalog,
  getApiErrorExamples,
  runApiErrorResponseTest
};
