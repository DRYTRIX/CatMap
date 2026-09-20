import { API_BASE, handle } from "./core";
import { translateApiError } from "../lib/apiErrors";

// Who is moderating and why. The label is self-declared (there is one shared
// admin token) and is recorded in the audit log next to each action.
const adminContext = { label: "", reason: "" };

export function setAdminContext({ label, reason } = {}) {
  if (label !== undefined) adminContext.label = label;
  if (reason !== undefined) adminContext.reason = reason;
}

function adminHeaders(token) {
  const headers = { "X-Admin-Token": token };
  const label = adminContext.label.trim();
  if (label) headers["X-Admin-Label"] = label;
  return headers;
}

/** Query string carrying the moderation reason for the audit log. */
function adminReasonQuery() {
  const reason = adminContext.reason.trim();
  return reason ? `?reason=${encodeURIComponent(reason.slice(0, 280))}` : "";
}

export async function fetchAdminCats({ token, q = "", reportedOnly = false, limit = 50, offset = 0 }) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set("q", q);
  if (reportedOnly) params.set("reported_only", "true");
  const res = await fetch(`${API_BASE}/api/admin/cats?${params}`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminMergeCats(intoId, fromId, token) {
  const form = new FormData();
  form.append("from_cat_id", fromId);
  const res = await fetch(`${API_BASE}/api/admin/cats/${intoId}/merge${adminReasonQuery()}`, {
    method: "POST",
    headers: adminHeaders(token),
    body: form,
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminDeleteCat(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/cats/${id}${adminReasonQuery()}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) return handle(res);
  return true;
}

export async function adminBulkSightings(action, ids, token) {
  const form = new FormData();
  form.append("action", action);
  form.append("ids", ids.join(","));
  const res = await fetch(`${API_BASE}/api/admin/sightings/bulk${adminReasonQuery()}`, {
    method: "POST",
    headers: adminHeaders(token),
    body: form,
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function fetchAdminReports({ token, sort = "reports", limit = 50, offset = 0 }) {
  const params = new URLSearchParams({ sort, limit: String(limit), offset: String(offset) });
  const res = await fetch(`${API_BASE}/api/admin/reports?${params}`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminHideSighting(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}/hide${adminReasonQuery()}`, {
    method: "POST",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminUnhideSighting(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}/unhide${adminReasonQuery()}`, {
    method: "POST",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminDeleteSighting(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}${adminReasonQuery()}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* 204 has no body */
    }
    throw new Error(translateApiError(detail));
  }
  return true;
}

export async function fetchAdminPending({ token, limit = 50, offset = 0 }) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${API_BASE}/api/admin/pending?${params}`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminApproveSighting(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}/approve${adminReasonQuery()}`, {
    method: "POST",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function fetchAdminMetrics({ token }) {
  const res = await fetch(`${API_BASE}/api/admin/metrics`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function fetchAdminDatabaseUsage({ token }) {
  const res = await fetch(`${API_BASE}/api/admin/database-usage`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function fetchAdminActions({ token, limit = 20, offset = 0 }) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${API_BASE}/api/admin/actions?${params}`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function fetchAdminIssues({ token, status, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) params.set("status", status);
  const res = await fetch(`${API_BASE}/api/admin/issues?${params}`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminResolveIssue(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/issues/${id}/resolve`, {
    method: "POST",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminBlockToken(deviceTokenValue, adminToken, reason = "") {
  const form = new FormData();
  form.append("token", deviceTokenValue);
  form.append("reason", reason);
  const res = await fetch(`${API_BASE}/api/admin/blocked-tokens`, {
    method: "POST",
    headers: adminHeaders(adminToken),
    body: form,
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminDeleteIssue(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/issues/${id}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* 204 has no body */
    }
    throw new Error(translateApiError(detail));
  }
  return true;
}

export async function fetchAdminComments({ token, status, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) params.set("status", status);
  const res = await fetch(`${API_BASE}/api/admin/comments?${params}`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminHideComment(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/comments/${id}/hide`, {
    method: "POST",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminUnhideComment(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/comments/${id}/unhide`, {
    method: "POST",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminDeleteComment(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/comments/${id}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* 204 has no body */
    }
    throw new Error(translateApiError(detail));
  }
  return true;
}

export async function fetchAdminBlockedTokens({ token, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${API_BASE}/api/admin/blocked-tokens?${params}`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminDeleteBlockedToken(tokenValue, adminToken) {
  const res = await fetch(
    `${API_BASE}/api/admin/blocked-tokens/${encodeURIComponent(tokenValue)}`,
    {
      method: "DELETE",
      headers: adminHeaders(adminToken),
    }
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* 204 has no body */
    }
    throw new Error(translateApiError(detail));
  }
  return true;
}

export async function adminSendPushTest(adminToken, { deviceToken, title, body, url } = {}) {
  const form = new FormData();
  form.append("device_token", deviceToken || "");
  if (title) form.append("title", title);
  if (body) form.append("body", body);
  if (url) form.append("url", url);
  const res = await fetch(`${API_BASE}/api/admin/push/test`, {
    method: "POST",
    headers: adminHeaders(adminToken),
    body: form,
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

/**
 * Fetch an admin image (served even for hidden/gone rows) as an object URL.
 * Uses fetch + blob so the admin token travels in a header, not the URL —
 * lets the moderation UI show thumbnails of hidden sightings. Caller must
 * URL.revokeObjectURL() the result when done.
 */
export async function adminImageObjectUrl(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-Admin-Token": token },
  });
  if (!res.ok) throw new Error(`Image failed (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
