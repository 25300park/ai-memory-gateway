const AdminAPI = {
  getToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("token");

    if (tokenFromUrl) {
      localStorage.setItem("admin_token", tokenFromUrl);
      return tokenFromUrl;
    }

    return localStorage.getItem("admin_token") || "";
  },

  getHeaders(extraHeaders = {}) {
    const token = this.getToken();

    const headers = {
      ...extraHeaders
    };

    if (token) {
      headers["x-admin-token"] = token;
    }

    return headers;
  },

  async request(path, options = {}) {
    const headers = this.getHeaders(options.headers || {});

    const response = await fetch(path, {
      ...options,
      headers
    });

    const contentType = response.headers.get("content-type") || "";

    let data;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const message =
        typeof data === "string"
          ? data
          : data?.error?.message || data?.error || `Request failed with status ${response.status}`;

      throw new Error(message);
    }

    return data;
  },

  async get(path) {
    return this.request(path, {
      method: "GET"
    });
  },

  async post(path, body = null) {
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return this.request(path, options);
  },

  async patch(path, body = null) {
    const options = {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return this.request(path, options);
  },

  clearToken() {
    localStorage.removeItem("admin_token");
  }
};