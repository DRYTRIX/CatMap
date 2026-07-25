import L from "leaflet";

// A divIcon renders identical HTML for a given (count, stale, kind) variant, and
// Leaflet builds a fresh DOM node per marker from the shared instance — so we can
// cache instances by variant key and avoid rebuilding icon HTML on every render
// for large dot sets. Only a few dozen distinct variants ever exist.
const catIconCache = new Map();
const clusterIconCache = new Map();

/**
 * Teardrop cat-pin marker with an optional confirmation-count badge.
 * Built as an L.divIcon so it can be styled entirely via CSS (styles.css).
 * Missing-cat pins use a red/coral gradient via `.cat-pin--missing`.
 */
export function catIcon(count = 0, stale = false, kind = "sighting") {
  const badgeText = count > 99 ? "99+" : count;
  const isMissing = kind === "missing";
  const key = `${badgeText}|${stale ? 1 : 0}|${isMissing ? 1 : 0}`;
  const cached = catIconCache.get(key);
  if (cached) return cached;

  const badge =
    count > 0 ? `<span class="cat-pin-badge">${badgeText}</span>` : "";
  // Missing pins get an alert flag + red glyph so they stand out from sightings.
  const alert = isMissing ? `<span class="cat-pin-alert" aria-hidden="true">!</span>` : "";
  const glyph = isMissing ? "🙀" : "🐱";
  const classes = ["cat-pin"];
  if (isMissing) classes.push("cat-pin--missing");
  if (stale) classes.push("cat-pin--stale");
  const icon = L.divIcon({
    className: "cat-pin-wrap",
    html: `
      <div class="${classes.join(" ")}">
        <span class="cat-pin-glyph">${glyph}</span>
        ${alert}
        ${badge}
      </div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 46],
    popupAnchor: [0, -42],
  });
  catIconCache.set(key, icon);
  return icon;
}

function clusterBubble(count) {
  let size = "sm";
  if (count >= 100) size = "lg";
  else if (count >= 10) size = "md";
  const label = count > 999 ? "999+" : count;
  const key = `${size}|${label}`;
  const cached = clusterIconCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: "cat-cluster-wrap",
    html: `<div class="cat-cluster cat-cluster-${size}"><span>${label}</span></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
  clusterIconCache.set(key, icon);
  return icon;
}

/** Cluster bubble for client-side (react-leaflet-cluster) clusters. */
export function clusterIcon(cluster) {
  return clusterBubble(cluster.getChildCount());
}

/** Cluster bubble for server-aggregated grid cells (zoomed-out views). */
export function serverClusterIcon(count) {
  return clusterBubble(count);
}
