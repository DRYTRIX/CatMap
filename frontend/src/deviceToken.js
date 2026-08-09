const KEY = "catmap_device_token";

function makeToken() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback for older browsers.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceToken() {
  let token = localStorage.getItem(KEY);
  if (!token) {
    token = makeToken();
    localStorage.setItem(KEY, token);
  }
  return token;
}

// Local cache of which sightings this device has already confirmed.
const CONFIRMED_KEY = "catmap_confirmed";

export function getConfirmedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CONFIRMED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function markConfirmed(id) {
  const set = getConfirmedSet();
  set.add(id);
  localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...set]));
}

// Sightings created on this device (cache; ownership UI prefers server is_mine).
const CREATED_KEY = "catmap_created";

export function getCreatedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CREATED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function markCreated(id) {
  const set = getCreatedSet();
  set.add(id);
  localStorage.setItem(CREATED_KEY, JSON.stringify([...set]));
}

/** Local cache fallback; prefer `data.is_mine` from the API when available. */
export function isMine(id) {
  return getCreatedSet().has(id);
}

/** Export device identity for transfer to another browser/device. */
export function exportIdentity() {
  let favorites = [];
  try {
    favorites = JSON.parse(localStorage.getItem("catmap_favorites") || "[]");
  } catch {
    /* ignore */
  }
  return JSON.stringify({
    v: 2,
    token: getDeviceToken(),
    favorites,
    created: [...getCreatedSet()],
    confirmed: [...getConfirmedSet()],
  });
}

/** Replace local identity from exported JSON (merges favorites/created/confirmed). */
export function importIdentity(jsonText) {
  const data = JSON.parse(jsonText);
  if (!data?.token || typeof data.token !== "string") {
    throw new Error("Invalid identity data.");
  }
  localStorage.setItem(KEY, data.token);
  if (Array.isArray(data.favorites)) {
    const existing = new Set(
      JSON.parse(localStorage.getItem("catmap_favorites") || "[]")
    );
    for (const id of data.favorites) existing.add(id);
    localStorage.setItem("catmap_favorites", JSON.stringify([...existing]));
  }
  if (Array.isArray(data.created)) {
    const existing = getCreatedSet();
    for (const id of data.created) existing.add(id);
    localStorage.setItem(CREATED_KEY, JSON.stringify([...existing]));
  }
  if (Array.isArray(data.confirmed)) {
    const existing = getConfirmedSet();
    for (const id of data.confirmed) existing.add(id);
    localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...existing]));
  }
}
