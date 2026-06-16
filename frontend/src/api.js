import { getDeviceToken } from "./deviceToken";

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

export async function fetchDots(bbox, signal) {
  const params = new URLSearchParams({
    min_lat: bbox.minLat,
    max_lat: bbox.maxLat,
    min_lng: bbox.minLng,
    max_lng: bbox.maxLng,
  });
  const res = await fetch(`${API_BASE}/api/sightings?${params}`, { signal });
  return handle(res);
}

export async function fetchClusters(bbox, zoom, signal) {
  const params = new URLSearchParams({
    min_lat: bbox.minLat,
    max_lat: bbox.maxLat,
    min_lng: bbox.minLng,
    max_lng: bbox.maxLng,
    zoom,
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
 * Create a sighting. Uses XMLHttpRequest (not fetch) so we can report upload
 * progress via the optional `onProgress(percent)` callback.
 */
export function createSighting({ file, lat, lng, description, onProgress }) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("image", file);
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

export async function editSighting(id, { description, lat, lng } = {}) {
  const form = new FormData();
  if (description != null) form.append("description", description);
  if (lat != null && lng != null) {
    form.append("lat", lat);
    form.append("lng", lng);
  }
  const res = await fetch(`${API_BASE}/api/sightings/${id}`, {
    method: "PATCH",
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

// ---- Admin moderation (token-gated; X-Admin-Token kept in sessionStorage) ----

const ADMIN_KEY = "catmap_admin_token";

export function getAdminToken() {
  return sessionStorage.getItem(ADMIN_KEY) || "";
}

export function setAdminToken(token) {
  if (token) sessionStorage.setItem(ADMIN_KEY, token);
  else sessionStorage.removeItem(ADMIN_KEY);
}

function adminHeaders() {
  return { "X-Admin-Token": getAdminToken() };
}

async function adminHandle(res) {
  if (res.status === 401 || res.status === 404) {
    // 404 is what require_admin returns when ADMIN_TOKEN is unset on the server.
    throw new Error("Invalid or disabled admin token.");
  }
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.status === 204 ? true : res.json();
}

export async function adminListReports() {
  const res = await fetch(`${API_BASE}/api/admin/reports`, { headers: adminHeaders() });
  return adminHandle(res);
}

export async function adminHide(id) {
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}/hide`, {
    method: "POST",
    headers: adminHeaders(),
  });
  return adminHandle(res);
}

export async function adminUnhide(id) {
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}/unhide`, {
    method: "POST",
    headers: adminHeaders(),
  });
  return adminHandle(res);
}

export async function adminDelete(id) {
  const res = await fetch(`${API_BASE}/api/admin/sightings/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  return adminHandle(res);
}

/**
 * Fetch an admin image (served even for hidden/gone rows) as an object URL.
 * Uses fetch + blob so the admin token travels in a header, not the URL.
 * Caller must URL.revokeObjectURL() the result when done.
 */
export async function adminImageObjectUrl(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(`Image failed (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
