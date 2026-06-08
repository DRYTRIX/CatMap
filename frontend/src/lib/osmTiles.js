/** OSM tile layer defaults — sends site origin as Referer per tile usage policy. */
export const OSM_TILE_PROPS = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; OpenStreetMap contributors",
  referrerPolicy: "strict-origin-when-cross-origin",
};
