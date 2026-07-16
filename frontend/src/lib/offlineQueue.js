import { createSighting } from "../api";

const DB_NAME = "catmap_offline";
const STORE = "pending_sightings";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueSighting(payload) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ ...payload, queuedAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function pendingCount() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function flushQueue({ onProgress, onItemDone } = {}) {
  const db = await openDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  for (const item of items) {
    const files = item.files.map((blob, i) => new File([blob], `photo-${i}.jpg`, { type: blob.type }));
    try {
      const created = await createSighting({
        files,
        lat: item.lat,
        lng: item.lng,
        description: item.description,
        color: item.color,
        isEarTipped: item.isEarTipped,
        isStray: item.isStray,
        kind: item.kind,
        catName: item.catName,
        contact: item.contact,
        onProgress,
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(item.id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      onItemDone?.(created);
    } catch {
      break;
    }
  }
}

export function isNetworkError(err) {
  const msg = String(err?.message || err || "");
  return (
    !navigator.onLine ||
    msg.includes("Network error") ||
    msg.includes("Failed to fetch")
  );
}

export async function serializeFiles(fileList) {
  const blobs = [];
  for (const f of fileList) {
    blobs.push(f instanceof Blob ? f : new Blob([await f.arrayBuffer()]));
  }
  return blobs;
}
