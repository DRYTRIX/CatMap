import L from "leaflet";

/**
 * Teardrop cat-pin marker with an optional confirmation-count badge.
 * Built as an L.divIcon so it can be styled entirely via CSS (styles.css).
 * Missing-cat pins use a red/coral gradient via `.cat-pin--missing`.
 */
export function catIcon(count = 0, stale = false, kind = "sighting") {
  const badge =
    count > 0 ? `<span class="cat-pin-badge">${count > 99 ? "99+" : count}</span>` : "";
  const isMissing = kind === "missing";
  // Missing pins get an alert flag + red glyph so they stand out from sightings.
  const alert = isMissing ? `<span class="cat-pin-alert" aria-hidden="true">!</span>` : "";
  const glyph = isMissing ? "🙀" : "🐱";
  const classes = ["cat-pin"];
  if (isMissing) classes.push("cat-pin--missing");
  if (stale) classes.push("cat-pin--stale");
  return L.divIcon({
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
}

function clusterBubble(count) {
  let size = "sm";
  if (count >= 100) size = "lg";
  else if (count >= 10) size = "md";
  const label = count > 999 ? "999+" : count;
  return L.divIcon({
    className: "cat-cluster-wrap",
    html: `<div class="cat-cluster cat-cluster-${size}"><span>${label}</span></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/** Cluster bubble for client-side (react-leaflet-cluster) clusters. */
export function clusterIcon(cluster) {
  return clusterBubble(cluster.getChildCount());
}

/** Cluster bubble for server-aggregated grid cells (zoomed-out views). */
export function serverClusterIcon(count) {
  return clusterBubble(count);
}
