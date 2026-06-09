const {
  extractAdminToken,
  validateAdminToken,
  logAdminSecurityEvent
} = require("../services/security.service");
const { getRoleForTokenLabel } = require("../services/admin-permission.service");

function isStaticAssetPath(path) {
  return (
    path.startsWith("/css/") ||
    path.startsWith("/js/") ||
    path.startsWith("/images/") ||
    path.endsWith(".css") ||
    path.endsWith(".js") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".webp") ||
    path.endsWith(".ico")
  );
}

function renderAdminConfigError(message) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Admin Auth Error</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; background: #f9fafb; color: #111827; }
          .box { max-width: 720px; margin: auto; background: #fff; padding: 24px; border-radius: 12px; border: 1px solid #e5e7eb; }
          code { background: #f3f4f6; padding: 3px 6px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2>Admin Auth Configuration Error</h2>
          <p>${message}</p>
          <p>Set <code>ADMIN_TOKEN</code> in your .env file and restart the server.</p>
        </div>
      </body>
    </html>
  `;
}

function renderAdminLogin(reason = "") {
  const safeReason = reason ? String(reason).replace(/[<>&"]/g, "") : "";
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>AI Memory Gateway Admin Login</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #f4f6f8;
            color: #111827;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .login-box {
            width: 100%;
            max-width: 420px;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 16px;
            padding: 28px;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
          }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { color: #6b7280; line-height: 1.5; }
          input {
            width: 100%;
            border: 1px solid #d1d5db;
            border-radius: 10px;
            padding: 12px;
            font-size: 14px;
            margin: 12px 0;
          }
          button {
            width: 100%;
            border: 0;
            border-radius: 10px;
            padding: 12px;
            background: #2563eb;
            color: white;
            font-weight: 700;
            cursor: pointer;
          }
          .hint { margin-top: 14px; font-size: 12px; color: #9ca3af; }
          .reason { color: #b91c1c; background: #fee2e2; padding: 10px; border-radius: 8px; }
        </style>
      </head>
      <body>
        <div class="login-box">
          <h1>Admin Access</h1>
          <p>Enter your admin token to access AI Memory Gateway Admin.</p>
          ${safeReason ? `<p class="reason">${safeReason}</p>` : ""}

          <input id="adminTokenInput" type="password" placeholder="Admin token" />
          <button onclick="login()">Open Admin</button>

          <div class="hint">Token rotation supports ADMIN_TOKEN and SECONDARY_ADMIN_TOKEN.</div>
        </div>

        <script>
          function login() {
            const token = document.getElementById("adminTokenInput").value.trim();
            if (!token) {
              alert("Please enter admin token.");
              return;
            }
            localStorage.setItem("admin_token", token);
            window.location.href = "/admin?token=" + encodeURIComponent(token);
          }
        </script>
      </body>
    </html>
  `;
}

async function adminAuthMiddleware(req, res, next) {
  const path = req.path || "";

  if (isStaticAssetPath(path)) {
    return next();
  }

  const { value: token, source } = extractAdminToken(req);
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
        event_type: "admin_page_auth",
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
    event_type: "admin_page_auth",
    outcome: "failed",
    reason: result.status,
    token_source: source,
    token_label: null,
    token_fingerprint: result.provided_fingerprint || null
  });

  if (result.status === "ADMIN_TOKEN_NOT_CONFIGURED") {
    return res.status(500).send(renderAdminConfigError(result.message));
  }

  return res.status(result.http_status || 401).send(renderAdminLogin(result.message));
}

module.exports = adminAuthMiddleware;
