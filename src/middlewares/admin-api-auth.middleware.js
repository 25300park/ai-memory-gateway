const {
  extractAdminToken,
  validateAdminToken,
  logAdminSecurityEvent
} = require("../services/security.service");
const { getRoleForTokenLabel } = require("../services/admin-permission.service");
const { sendStandardError } = require("../services/api-error.service");

async function adminApiAuthMiddleware(req, res, next) {
  const { value: token, source } = extractAdminToken(req, { allowQuery: false });
  const result = validateAdminToken(token);

  if (result.ok) {
    req.adminAuth = {
      token_label: result.token_label,
      env_name: result.env_name,
      token_source: source,
      token_fingerprint: result.token_fingerprint,
      admin_enabled: result.admin_enabled,
      role: getRoleForTokenLabel(result.token_label)
    };

    if (result.admin_enabled) {
      logAdminSecurityEvent({
        req,
        event_type: "admin_api_auth",
        outcome: "success",
        reason: result.status,
        token_source: source,
        token_label: result.token_label,
        token_fingerprint: result.token_fingerprint
      });
    }

    return next();
  }

  logAdminSecurityEvent({
    req,
    event_type: "admin_api_auth",
    outcome: "failed",
    reason: result.status,
    token_source: source,
    token_label: null,
    token_fingerprint: result.provided_fingerprint || null
  });

  return sendStandardError(res, {
    req,
    code: result.status,
    message: result.message,
    statusCode: result.http_status || 401,
    details: {
      token_source: source,
      token_rotation_supported: true,
      provided_fingerprint: result.provided_fingerprint || null
    },
    source: "admin-api-auth.middleware"
  });
}

module.exports = adminApiAuthMiddleware;
