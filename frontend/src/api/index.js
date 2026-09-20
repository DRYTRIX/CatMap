import { API_BASE, authHeaders, formBody, handle, UPLOAD_TIMEOUT_MS } from "./core";
import { translateApiError } from "../lib/apiErrors";
import { filtersToParams } from "../lib/filters";
export * from "./core";
export * from "./admin";
export * from "./auth";


export async function fetchStatsDetail(days = 30, signal) {
  const res = await fetch(`${API_BASE}/api/stats/detail?days=${days}`, { signal });
  return handle(res);
}

/** Download URL for the public GeoJSON/CSV export of a bounding box. */
export function exportUrl(format, bbox) {
  const params = new URLSearchParams({
    format,
    min_lat: bbox.minLat,
    max_lat: bbox.maxLat,
    min_lng: bbox.minLng,
    max_lng: bbox.maxLng,
  });
  return `${API_BASE}/api/sightings/export?${params}`;
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/api/stats`);
  return handle(res);
}

// Server-side cap on dots per request (backend `max_dots_per_query`). When a
// response reaches it, more sightings may exist and can be paged with `offset`.
export const DOTS_PAGE_SIZE = 2000;

export async function fetchDots(bbox, filters = {}, signal, { offset = 0 } = {}) {
  const params = new URLSearchParams({
    min_lat: bbox.minLat,
    max_lat: bbox.maxLat,
    min_lng: bbox.minLng,
    max_lng: bbox.maxLng,
    ...filtersToParams(filters),
  });
  if (offset > 0) params.set("offset", offset);
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
  const res = await fetch(`${API_BASE}/api/sightings/${id}`, {
    headers: authHeaders(),
  });
  return handle(res);
}

export async function fetchSimilarSightings(id, signal) {
  const res = await fetch(`${API_BASE}/api/sightings/${id}/similar`, { signal });
  return handle(res);
}

export async function fetchCatProfile(id, signal) {
  const res = await fetch(`${API_BASE}/api/cats/${id}`, {
    headers: authHeaders(),
    signal,
  });
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

export async function renameCatProfile(catId, name) {
  const form = new FormData();
  form.append("name", name ?? "");
  const res = await fetch(`${API_BASE}/api/cats/${catId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function reportCatProfile(catId, reason = "other") {
  const form = new FormData();
  form.append("reason", reason);
  const res = await fetch(`${API_BASE}/api/cats/${catId}/report`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function suggestCatMerge(intoCatId, fromCatId) {
  const form = new FormData();
  form.append("from_cat_id", fromCatId);
  const res = await fetch(`${API_BASE}/api/cats/${intoCatId}/merge-suggestions`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function fetchMergeSuggestions(catId, signal) {
  const res = await fetch(`${API_BASE}/api/cats/${catId}/merge-suggestions`, {
    headers: authHeaders(),
    signal,
  });
  return handle(res);
}

export async function respondMergeSuggestion(id, accept) {
  const res = await fetch(
    `${API_BASE}/api/cats/merge-suggestions/${id}/${accept ? "accept" : "reject"}`,
    { method: "POST", headers: authHeaders() }
  );
  return handle(res);
}

export async function sendPrivateTip(sightingId, text) {
  const form = new FormData();
  form.append("text", text);
  const res = await fetch(`${API_BASE}/api/sightings/${sightingId}/message`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function fetchWatches({ limit = 50, offset = 0 } = {}, signal) {
  const params = new URLSearchParams({ limit, offset });
  const res = await fetch(`${API_BASE}/api/watches?${params}`, {
    headers: authHeaders(),
    signal,
  });
  return handle(res);
}

export async function createAreaWatch({ lat, lng, radiusKm, label }) {
  const form = new FormData();
  form.append("lat", lat);
  form.append("lng", lng);
  form.append("radius_km", radiusKm);
  if (label) form.append("label", label);
  const res = await fetch(`${API_BASE}/api/watches/areas`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function watchTarget(targetType, targetId) {
  const form = new FormData();
  form.append("target_type", targetType);
  form.append("target_id", targetId);
  const res = await fetch(`${API_BASE}/api/watches`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function unwatchTarget(targetType, targetId) {
  const params = new URLSearchParams({
    target_type: targetType,
    target_id: targetId,
  });
  const res = await fetch(`${API_BASE}/api/watches?${params}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function fetchRecent(
  { limit = 20, offset = 0, sort = "recent", kind, q, status, exclude_outcome, near_lat, near_lng, radius_km } = {},
  signal
) {
  const params = new URLSearchParams({ limit, offset, sort });
  if (kind) params.set("kind", kind);
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (exclude_outcome) params.set("exclude_outcome", exclude_outcome);
  if (near_lat != null) params.set("near_lat", near_lat);
  if (near_lng != null) params.set("near_lng", near_lng);
  if (radius_km != null) params.set("radius_km", radius_km);
  const res = await fetch(`${API_BASE}/api/sightings/recent?${params}`, { signal });
  return handle(res);
}

export async function fetchMine({ limit = 50, offset = 0 } = {}, signal) {
  const params = new URLSearchParams({ limit, offset });
  const res = await fetch(`${API_BASE}/api/sightings/mine?${params}`, {
    headers: authHeaders(),
    signal,
  });
  return handle(res);
}

export async function fetchCats(
  { limit = 20, offset = 0, q, near_lat, near_lng, radius_km } = {},
  signal
) {
  const params = new URLSearchParams({ limit, offset });
  if (q) params.set("q", q);
  if (near_lat != null) params.set("near_lat", near_lat);
  if (near_lng != null) params.set("near_lng", near_lng);
  if (radius_km != null) params.set("radius_km", radius_km);
  const res = await fetch(`${API_BASE}/api/cats?${params}`, { signal });
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
  contactPublic = false,
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
    if (kind === "missing") form.append("contact_public", contactPublic ? "true" : "false");
    if (color) form.append("color", color);
    if (isEarTipped !== "") form.append("is_ear_tipped", isEarTipped);
    if (isStray !== "") form.append("is_stray", isStray);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/sightings`);
    const headers = authHeaders();
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.timeout = UPLOAD_TIMEOUT_MS;

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
    // Treat a timeout as a (retryable) network error so the offline queue holds
    // the item for a later retry instead of dropping it.
    xhr.ontimeout = () => reject(new Error(translateApiError("Network error during upload.")));
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
    const headers = authHeaders();
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.timeout = UPLOAD_TIMEOUT_MS;

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
    xhr.ontimeout = () => reject(new Error(translateApiError("Network error during upload.")));
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

export async function markFound(id, { outcome = "returned_home", story = "" } = {}) {
  const form = new FormData();
  form.append("outcome", outcome);
  if (story.trim()) form.append("story", story.trim());
  const res = await fetch(`${API_BASE}/api/sightings/${id}/found`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle(res);
}

export async function relistSighting(id) {
  const res = await fetch(`${API_BASE}/api/sightings/${id}/relist`, {
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

export const NOTIFICATIONS_PAGE_SIZE = 50;

export async function fetchNotifications(signal, { offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: NOTIFICATIONS_PAGE_SIZE, offset });
  const res = await fetch(`${API_BASE}/api/notifications?${params}`, {
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

export async function deleteNotification(id) {
  const res = await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function fetchVapidPublicKey() {
  const res = await fetch(`${API_BASE}/api/push/vapid-public-key`);
  return handle(res);
}

export async function fetchPushAlertPrefs(signal) {
  const res = await fetch(`${API_BASE}/api/push/alerts`, {
    headers: authHeaders(),
    signal,
  });
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
 * Reverse-geocode coordinates to a human-readable place via Nominatim.
 * Best-effort: returns a display string or null (never throws for the caller
 * to have to handle). Respect the usage policy — call on demand only, never in
 * a loop over map dots.
 */
export async function reverseGeocode(lat, lng, signal) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "jsonv2",
    zoom: "16",
    addressdetails: "0",
  });
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      { signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.display_name || null;
  } catch {
    return null;
  }
}


// ---- Hearts ----

export async function fetchHearts({ limit = 100, offset = 0 } = {}, signal) {
  const params = new URLSearchParams({ limit, offset });
  const res = await fetch(`${API_BASE}/api/hearts?${params}`, {
    headers: authHeaders(),
    signal,
  });
  return handle(res);
}

export async function addHeart(targetType, targetId) {
  const res = await fetch(`${API_BASE}/api/hearts`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({ target_type: targetType, target_id: targetId }),
  });
  return handle(res);
}

export async function removeHeart(targetType, targetId) {
  const params = new URLSearchParams({
    target_type: targetType,
    target_id: targetId,
  });
  const res = await fetch(`${API_BASE}/api/hearts?${params}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function importHearts({ sightingIds = [], catIds = [] } = {}) {
  const res = await fetch(`${API_BASE}/api/hearts/import`, {
    method: "POST",
    headers: authHeaders(),
    body: formBody({
      sighting_ids: sightingIds.join(","),
      cat_ids: catIds.join(","),
    }),
  });
  return handle(res);
}

