import { getDeviceToken } from "./deviceToken";
import { filtersToParams } from "./lib/filters";

// In dev, VITE_API_BASE is unset and we use the Vite proxy / same origin.
// In Docker/Render it points at the backend service URL.
const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

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
    throw new Error(detail);
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

export async function fetchRecent({ limit = 20, offset = 0, sort = "recent" } = {}, signal) {
  const params = new URLSearchParams({ limit, offset, sort });
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
export function createSighting({ files, lat, lng, description, onProgress }) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) {
      form.append("images", file);
    }
    form.append("lat", lat);
    form.append("lng", lng);
    form.append("description", description || "");

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
        reject(new Error(body?.detail || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
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

export async function markGone(id) {
  const res = await fetch(`${API_BASE}/api/sightings/${id}/gone`, {
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
    throw new Error(detail);
  }
  return true;
}

// ---------- Admin (gated by ADMIN_TOKEN, sent as X-Admin-Token) ----------

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
    throw new Error(detail);
  }
  return true;
}

export async function fetchAdminActions({ token, limit = 20, offset = 0 }) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${API_BASE}/api/admin/actions?${params}`, {
    headers: adminHeaders(token),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  return handle(res);
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
