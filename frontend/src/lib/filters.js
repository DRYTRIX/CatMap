// Discovery filters for the map: persisted to localStorage and translated
// into the `/api/sightings` query params added in Phase 1.

const STORAGE_KEY = "catmap_filters";

export const CAT_COLORS = [
  "black",
  "white",
  "gray",
  "orange",
  "brown",
  "tabby",
  "calico",
  "tuxedo",
  "tortoiseshell",
  "siamese",
];

export const DEFAULT_FILTERS = {
  since: "", // yyyy-mm-dd
  until: "", // yyyy-mm-dd
  color: "",
  isEarTipped: "", // "" | "true" | "false"
  isStray: "", // "" | "true" | "false"
  kind: "", // "" | "sighting" | "missing"
  minConfidence: 0, // 0..1, 0 = no filter
};

export function loadFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULT_FILTERS, ...raw };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

export function saveFilters(filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* storage unavailable (private mode, etc.) */
  }
}

export function countActiveFilters(filters) {
  let n = 0;
  if (filters.since) n++;
  if (filters.until) n++;
  if (filters.color) n++;
  if (filters.isEarTipped) n++;
  if (filters.isStray) n++;
  if (filters.kind) n++;
  if (filters.minConfidence > 0) n++;
  return n;
}

/** Convert UI filter state into `/api/sightings` query params (active filters only). */
export function filtersToParams(filters) {
  const params = {};
  if (filters.since) {
    params.since = new Date(`${filters.since}T00:00:00`).toISOString();
  }
  if (filters.until) {
    // The "until" date should include the whole day the user picked.
    params.until = new Date(`${filters.until}T23:59:59.999`).toISOString();
  }
  if (filters.color) params.color = filters.color;
  if (filters.isEarTipped) params.is_ear_tipped = filters.isEarTipped;
  if (filters.isStray) params.is_stray = filters.isStray;
  if (filters.kind) params.kind = filters.kind;
  if (filters.minConfidence > 0) params.min_confidence = filters.minConfidence;
  return params;
}
