const STORAGE_KEY = "catmap_favorites";

// Fired on the window whenever the favorites set changes, so open views
// (e.g. the favorites list) can refresh without polling.
const CHANGE_EVENT = "catmap:favorites-changed";

export function getFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function isFavorite(id) {
  return getFavorites().has(id);
}

export function toggleFavorite(id) {
  const set = getFavorites();
  const nowFavorite = !set.has(id);
  if (nowFavorite) {
    set.add(id);
  } else {
    set.delete(id);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { id, favorite: nowFavorite } }));
  return nowFavorite;
}

export function removeFavorite(id) {
  const set = getFavorites();
  if (!set.has(id)) return;
  set.delete(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { id, favorite: false } }));
}

export function onFavoritesChanged(handler) {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
