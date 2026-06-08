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

// Sightings created on this device (so we can show the Delete action).
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

export function isMine(id) {
  return getCreatedSet().has(id);
}
