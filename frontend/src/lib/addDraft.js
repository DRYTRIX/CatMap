import { QUEUE_MAX_AGE_MS } from "./offlineQueue";

// A single in-progress "add sighting" draft, kept in IndexedDB so an accidental
// close or reload doesn't lose photos and typed text. Separate database from
// the offline queue so its schema version stays untouched.
const DB_NAME = "catmap_draft";
const STORE = "add_draft";
const KEY = "current";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Pure: is there anything worth saving? Kind/location alone are not. */
export function isDraftWorthSaving(d) {
  return Boolean(
    d &&
      ((d.photos && d.photos.length > 0) ||
        (d.description && d.description.trim()) ||
        (d.catName && d.catName.trim()) ||
        (d.contact && d.contact.trim()))
  );
}

/** Pure: drafts older than the queue retention window are discarded. */
export function isDraftExpired(d, now = Date.now(), maxAgeMs = QUEUE_MAX_AGE_MS) {
  return !d || (d.savedAt ?? 0) < now - maxAgeMs;
}

export async function saveDraft(draft) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...draft, savedAt: Date.now() }, KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearDraft() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns the saved draft, or null if none/expired (expired ones are removed). */
export async function loadDraft() {
  const db = await openDb();
  const draft = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  if (!draft) return null;
  if (isDraftExpired(draft)) {
    await clearDraft().catch(() => {});
    return null;
  }
  return draft;
}
