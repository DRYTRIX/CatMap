import { getDeviceToken } from "./deviceToken";
import { filtersToParams } from "./lib/filters";
import { translateApiError } from "./lib/apiErrors";
import { isNativePlatform } from "./lib/platform";

const RENDER_API = "https://catmap-backend.onrender.com";

// In dev, VITE_API_BASE is unset and we use the Vite proxy / same origin.
// Mobile/native builds always talk to the Render-hosted backend.
const API_BASE = (
  import.meta.env.VITE_API_BASE ||
  (isNativePlatform() ? RENDER_API : "")
).replace(/\/$/, "");

export function assetUrl(path) {
  // Backend returns relative paths like /api/sightings/<id>/photo.
  return `${API_BASE}${path}`;
}

function authHeaders() {
  return { "X-Device-Token": getDeviceToken() };
}

async function handle(res) {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(translateApiError(detail));
  }
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/api/stats`);
  return handle(res);
}

export async function fetchDots(bbox, filters = {}, signal) {
  const params = new URLSearchParams({
    min_lat: bbox.minLat,
    max_lat: bbox.maxLat,
    min_lng: bbox.minLng,
    max_lng: bbox.maxLng,
    ...filtersToParams(filters),
  });
  const res = await fetch(`${API_BASE}/api/sightings?${params}`, { signal });
  return handle(res);
}

export async function fetchClusters(bbox, zoom, filters = {}, signal) {
  const params = new URLSearchParams({
    min_lat: bbox.minLat,
    max_lat: bbox.maxLat,
    min_lng: bbox.minLng,
    max_lng: bbox.maxLng,
    zoom,
    ...filtersToParams(filters),
  });
  const res = await fetch(`${API_BASE}/api/sightings/clusters?${params}`, { signal });
  return handle(res);
}

export async function fetchSighting(id) {
  const res = await fetch(`${API_BASE}/api/sightings/${id}`);
  return handle(res);
}

export async function fetchSimilarSightings(id, signal) {
  const res = await fetch(`${API_BASE}/api/sightings/${id}/similar`, { signal });
  return handle(res);
}

export async function fetchCatProfile(id, signal) {
  const res = await fetch(`${API_BASE}/api/cats/${id}`, { signal });
  return handle(res);
}

export async function createCatProfile({ sightingIds, name = "" }) {
  const form = new FormData();
  form.append("sighting_ids", sightingIds.join(","));
  if (name) form.append("name", name);
  const res = await fetch(`${API_BASE}/api/cats`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function linkSightingToCat(catId, sightingId) {
  const form = new FormData();
  form.append("sighting_id", sightingId);
  const res = await fetch(`${API_BASE}/api/cats/${catId}/link`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function unlinkSightingFromCat(catId, sightingId) {
  const form = new FormData();
  form.append("sighting_id", sightingId);
  const res = await fetch(`${API_BASE}/api/cats/${catId}/unlink`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function fetchRecent(
  { limit = 20, offset = 0, sort = "recent", kind, q, status, near_lat, near_lng, radius_km } = {},
  signal
) {
  const params = new URLSearchParams({ limit, offset, sort });
  if (kind) params.set("kind", kind);
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (near_lat != null) params.set("near_lat", near_lat);
  if (near_lng != null) params.set("near_lng", near_lng);
  if (radius_km != null) params.set("radius_km", radius_km);
  const res = await fetch(`${API_BASE}/api/sightings/recent?${params}`, { signal });
  return handle(res);
}

export async function fetchMine(signal) {
  const res = await fetch(`${API_BASE}/api/sightings/mine`, {
    headers: authHeaders(),
    signal,
  });
  return handle(res);
}

/**
 * Create a sighting (1-6 photos). Uses XMLHttpRequest (not fetch) so we can
 * report upload progress via the optional `onProgress(percent)` callback.
 */
export function createSighting({
  files,
  lat,
  lng,
  description,
  color = "",
  isEarTipped = "",
  isStray = "",
  kind = "sighting",
  catName = "",
  contact = "",
  onProgress,
}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) {
      form.append("images", file);
    }
    form.append("lat", lat);
    form.append("lng", lng);
    form.append("description", description || "");
    form.append("kind", kind || "sighting");
    if (catName) form.append("cat_name", catName);
    if (contact) form.append("contact", contact);
    if (color) form.append("color", color);
    if (isEarTipped !== "") form.append("is_ear_tipped", isEarTipped);
    if (isStray !== "") form.append("is_stray", isStray);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/sightings`);
    xhr.setRequestHeader("X-Device-Token", getDeviceToken());

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
      } else {
        reject(new Error(translateApiError(body?.detail || `Upload failed (${xhr.status})`)));
      }
    };
    xhr.onerror = () => reject(new Error(translateApiError("Network error during upload.")));
    xhr.send(form);
  });
}

/**
 * Add 1+ photos to an existing sighting (community contribution). Uses
 * XMLHttpRequest so we can report upload progress via `onProgress(percent)`.
 * Resolves to the updated sighting detail.
 */
export function addSightingPhotos(id, files, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) {
      form.append("images", file);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/sightings/${id}/photos`);
    xhr.setRequestHeader("X-Device-Token", getDeviceToken());

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
      } else {
        reject(new Error(translateApiError(body?.detail || `Upload failed (${xhr.status})`)));
      }
    };
    xhr.onerror = () => reject(new Error(translateApiError("Network error during upload.")));
    xhr.send(form);
  });
}

/**
 * Edit a sighting's description/attributes. Only fields present in `fields`
 * are changed; creator-only (enforced by the backend via device token).
 */
export async function updateSighting(id, fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value);
  }
  const res = await fetch(`${API_BASE}/api/sightings/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function confirmSighting(id) {
  const res = await fetch(`${API_BASE}/api/sightings/${id}/confirm`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function reportSighting(id, reason = "") {
  const form = new FormData();
  form.append("reason", reason);
  const res = await fetch(`${API_BASE}/api/sightings/${id}/report`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function submitIssueReport(category, message) {
  const form = new FormData();
  form.append("category", category);
  form.append("message", message);
  form.append("page_url", window.location.href);
  const res = await fetch(`${API_BASE}/api/issues`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function markGone(id) {
  const res = await fetch(`${API_BASE}/api/sightings/${id}/gone`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function markFound(id) {
  const res = await fetch(`${API_BASE}/api/sightings/${id}/found`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function deleteSighting(id) {
  const res = await fetch(`${API_BASE}/api/sightings/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
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

export async function deleteSightingPhoto(sightingId, photoId) {
  const res = await fetch(`${API_BASE}/api/sightings/${sightingId}/photos/${photoId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(translateApiError(detail));
  }
  return true;
}

// ---------- Comments ----------

export async function fetchComments(sightingId, signal) {
  const res = await fetch(`${API_BASE}/api/sightings/${sightingId}/comments`, {
    headers: authHeaders(),
    signal,
  });
  return handle(res);
}

export async function createComment(sightingId, { text, lat, lng }) {
  const form = new FormData();
  form.append("text", text);
  if (lat != null && lng != null) {
    form.append("lat", lat);
    form.append("lng", lng);
  }
  const res = await fetch(`${API_BASE}/api/sightings/${sightingId}/comments`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function deleteComment(sightingId, commentId) {
  const res = await fetch(`${API_BASE}/api/sightings/${sightingId}/comments/${commentId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(translateApiError(detail));
  }
  return true;
}

export async function reportComment(sightingId, commentId) {
  const res = await fetch(
    `${API_BASE}/api/sightings/${sightingId}/comments/${commentId}/report`,
    { method: "POST", headers: authHeaders() }
  );
  return handle(res);
}

// ---------- Notifications & push ----------

export async function fetchNotifications(signal) {
  const res = await fetch(`${API_BASE}/api/notifications`, {
    headers: authHeaders(),
    signal,
  });
  return handle(res);
}

export async function fetchUnreadCount(signal) {
  const res = await fetch(`${API_BASE}/api/notifications/unread-count`, {
    headers: authHeaders(),
    signal,
  });
  return handle(res);
}

export async function markNotificationsRead(ids = []) {
  const form = new FormData();
  if (ids.length) form.append("ids", ids.join(","));
  const res = await fetch(`${API_BASE}/api/notifications/read`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function fetchVapidPublicKey() {
  const res = await fetch(`${API_BASE}/api/push/vapid-public-key`);
  return handle(res);
}

export async function subscribePush({
  platform,
  subscription,
  alertLat,
  alertLng,
  alertRadiusKm,
}) {
  const form = new FormData();
  form.append("platform", platform);
  form.append("subscription", subscription);
  if (alertLat != null) form.append("alert_lat", alertLat);
  if (alertLng != null) form.append("alert_lng", alertLng);
  if (alertRadiusKm != null) form.append("alert_radius_km", alertRadiusKm);
  const res = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function unsubscribePush(subscription) {
  const form = new FormData();
  form.append("subscription", subscription);
  const res = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: "DELETE",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

function adminHeaders(token) {
  return { "X-Admin-Token": token };
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
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}/hide`, {
    method: "POST",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminUnhideSighting(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}/unhide`, {
    method: "POST",
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
}

export async function adminDeleteSighting(id, token) {
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}`, {
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
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}/approve`, {
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

/**
 * Geocode a place name via OpenStreetMap Nominatim. Returns up to 5 results.
 * Respect the usage policy: debounce callers and pass an AbortSignaL.
 */
export async function geocode(query, signal) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "0",
    limit: "5",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
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
