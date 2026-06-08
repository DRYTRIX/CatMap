import L from "leaflet";

/**
 * Teardrop cat-pin marker with an optional confirmation-count badge.
 * Built as an L.divIcon so it can be styled entirely via CSS (styles.css).
 */
export function catIcon(count = 0) {
  const badge =
    count > 0 ? `<span class="cat-pin-badge">${count > 99 ? "99+" : count}</span>` : "";
  return L.divIcon({
    className: "cat-pin-wrap",
    html: `
      <div class="cat-pin">
        <span class="cat-pin-glyph">🐱</span>
        ${badge}
      </div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 46],
    popupAnchor: [0, -42],
  });
}

/** Cluster bubble whose size/intensity scales with the number of cats inside. */
export function clusterIcon(cluster) {
  const count = cluster.getChildCount();
  let size = "sm";
  if (count >= 100) size = "lg";
  else if (count >= 10) size = "md";
  return L.divIcon({
    className: "cat-cluster-wrap",
    html: `<div class="cat-cluster cat-cluster-${size}"><span>${count}</span></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}
