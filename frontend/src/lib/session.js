/** Opaque session token for signed-in accounts (Bearer header). */
const KEY = "catmap_session";

export function getSessionToken() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function setSessionToken(token) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function clearSessionToken() {
  setSessionToken(null);
}
