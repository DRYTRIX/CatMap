/**
 * Server-backed hearts (replaces localStorage favorites).
 * Keeps an optimistic local cache + change event for open views.
 */

import {
  addHeart,
  fetchHearts,
  importHearts,
  removeHeart,
} from "../api";

const CACHE_KEY = "catmap_hearts_cache";
const MIGRATED_KEY = "catmap_hearts_migrated";
const LEGACY_FAVORITES = "catmap_favorites";
const CHANGE_EVENT = "catmap:favorites-changed";

function readCache() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function writeCache(set) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function emit(id, favorite) {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { id, favorite } }));
}

export function getFavorites() {
  return readCache();
}

export function isFavorite(id) {
  return readCache().has(id);
}

export function isHearted(id) {
  return isFavorite(id);
}

export async function syncHeartsFromServer() {
  try {
    const rows = await fetchHearts();
    const set = new Set(
      rows.filter((r) => r.target_type === "sighting").map((r) => r.target_id)
    );
    // Also keep cat hearts under a prefixed key so sheets can check them.
    for (const r of rows) {
      if (r.target_type === "cat") set.add(`cat:${r.target_id}`);
    }
    writeCache(set);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { sync: true } }));
    return set;
  } catch {
    return readCache();
  }
}

export async function toggleFavorite(id, { targetType = "sighting" } = {}) {
  const cacheKey = targetType === "cat" ? `cat:${id}` : id;
  const set = readCache();
  const nowFavorite = !set.has(cacheKey);
  if (nowFavorite) {
    set.add(cacheKey);
    writeCache(set);
    emit(id, true);
    try {
      await addHeart(targetType, id);
    } catch (err) {
      set.delete(cacheKey);
      writeCache(set);
      emit(id, false);
      throw err;
    }
  } else {
    set.delete(cacheKey);
    writeCache(set);
    emit(id, false);
    try {
      await removeHeart(targetType, id);
    } catch (err) {
      set.add(cacheKey);
      writeCache(set);
      emit(id, true);
      throw err;
    }
  }
  return nowFavorite;
}

export function removeFavorite(id, { targetType = "sighting" } = {}) {
  const cacheKey = targetType === "cat" ? `cat:${id}` : id;
  const set = readCache();
  if (!set.has(cacheKey)) return Promise.resolve();
  set.delete(cacheKey);
  writeCache(set);
  emit(id, false);
  return removeHeart(targetType, id).catch(() => {});
}

export function onFavoritesChanged(handler) {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/** One-time push of legacy localStorage favorites to the server. */
export async function migrateFavoritesToHearts() {
  if (localStorage.getItem(MIGRATED_KEY) === "1") {
    await syncHeartsFromServer();
    return;
  }
  let ids = [];
  try {
    ids = JSON.parse(localStorage.getItem(LEGACY_FAVORITES) || "[]");
  } catch {
    ids = [];
  }
  if (Array.isArray(ids) && ids.length) {
    try {
      await importHearts({ sightingIds: ids });
    } catch {
      /* keep trying later */
      return;
    }
  }
  localStorage.setItem(MIGRATED_KEY, "1");
  await syncHeartsFromServer();
}

// Back-compat alias used by older imports.
export { toggleFavorite as toggleHeart };
