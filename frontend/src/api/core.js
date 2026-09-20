import { getDeviceToken } from "../deviceToken";
import { translateApiError } from "../lib/apiErrors";
import { isNativePlatform } from "../lib/platform";
import { clearSessionToken, getSessionToken } from "../lib/session";

const RENDER_API =
  import.meta.env.VITE_API_BASE_NATIVE || "https://catmap-backend.onrender.com";

// Abort photo uploads that stall (frozen connection) so the UI can recover
// instead of hanging with a stuck progress bar / disabled submit button.
export const UPLOAD_TIMEOUT_MS = 120_000;

// In dev, VITE_API_BASE is unset and we use the Vite proxy / same origin.
// Mobile/native builds always talk to the Render-hosted backend.
export const API_BASE = (
  import.meta.env.VITE_API_BASE ||
  (isNativePlatform() ? RENDER_API : "")
).replace(/\/$/, "");

export function assetUrl(path) {
  // Backend returns relative paths like /api/sightings/<id>/photo.
  return `${API_BASE}${path}`;
}

let onUnauthorized = null;

/** Register a callback invoked when the API returns 401 (expired session). */
export function clearSessionOnUnauthorized(handler) {
  onUnauthorized = handler;
}

export function authHeaders() {
  const session = getSessionToken();
  return {
    "X-Device-Token": getDeviceToken(),
    ...(session ? { Authorization: `Bearer ${session}` } : {}),
  };
}

export async function handle(res) {
  if (res.status === 401 && getSessionToken()) {
    clearSessionToken();
    if (onUnauthorized) onUnauthorized();
  }
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
  // 204 No Content (and other empty bodies) have nothing to parse; a 2xx with
  // an unparseable/empty body resolves to null rather than throwing.
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

export function formBody(fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    form.append(k, String(v));
  }
  return form;
}
