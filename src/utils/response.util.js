const { buildStandardError } = require("../services/api-error.service");

function success(res, {
  message = "Success",
  data = null,
  meta = null,
  statusCode = 200,
  req = null
} = {}) {
  return res.status(statusCode).json({
    ok: true,
    message,
    data,
    meta,
    request_id: req?.requestId || null,
    timestamp: new Date().toISOString()
  });
}

function fail(res, {
  code = "INTERNAL_ERROR",
  message = "An unexpected error occurred.",
  statusCode = 500,
  details = null,
  req = null,
  hint = null,
  source = null,
  exposeDetails = null
} = {}) {
  const payload = buildStandardError({
    req,
    code,
    message,
    statusCode,
    details,
    hint,
    source,
    exposeDetails
  });

  return res.status(payload.error.http_status || statusCode).json(payload);
}

function validationFail(res, message, details = null, req = null) {
  return fail(res, {
    code: "VALIDATION_ERROR",
    message,
    statusCode: 400,
    details,
    req,
    source: "validation"
  });
}

function notFound(res, message = "Resource not found.", req = null) {
  return fail(res, {
    code: "NOT_FOUND",
    message,
    statusCode: 404,
    req,
    source: "router"
  });
}

module.exports = {
  success,
  fail,
  validationFail,
  notFound
};
