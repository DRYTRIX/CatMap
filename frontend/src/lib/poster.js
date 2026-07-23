import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { assetUrl } from "../api";

/** Read a Blob into a base64 data URL. */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Fetch an image URL and return it as a data URL (needed so html-to-image can
 * rasterise cross-origin API photos without tainting the canvas). */
export async function fetchImageAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  return blobToDataUrl(await res.blob());
}

/** Render a share URL to a QR-code data URL. */
export function buildQrDataUrl(text) {
  return QRCode.toDataURL(text, { width: 320, margin: 1 });
}

/**
 * Load the poster's image assets. Photo and QR failures are non-fatal — the
 * poster degrades gracefully (placeholder / no QR).
 */
export async function loadPosterAssets({ photoUrl, shareUrl }) {
  const [photoDataUrl, qrDataUrl] = await Promise.all([
    photoUrl ? fetchImageAsDataUrl(assetUrl(photoUrl)).catch(() => null) : null,
    shareUrl ? buildQrDataUrl(shareUrl).catch(() => null) : null,
  ]);
  return { photoDataUrl, qrDataUrl };
}

/**
 * Capture a small static map snapshot around lat/lng as a data URL. Best-effort:
 * returns null on any failure (slow/blocked tiles, canvas taint) so it never
 * blocks PDF generation.
 *
 * Built directly on a <canvas> from OSM slippy tiles rather than via Leaflet +
 * html-to-image, which was unreliable (tiles weren't painted at capture time,
 * leaving the map blank). Tiles are loaded crossOrigin so the canvas stays
 * exportable; the pin is drawn with canvas primitives (no image → no taint).
 */
const TILE_SIZE = 256;

/** Web-Mercator: longitude → fractional tile X at zoom. */
export function lngToTileX(lng, zoom) {
  return ((lng + 180) / 360) * 2 ** zoom;
}

/** Web-Mercator: latitude → fractional tile Y at zoom. */
export function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

function loadTile(url, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

export async function captureMapSnapshot(lat, lng, { width = 700, height = 200, zoom = 15 } = {}) {
  try {
    const n = 2 ** zoom;
    const centerX = lngToTileX(lng, zoom) * TILE_SIZE;
    const centerY = latToTileY(lat, zoom) * TILE_SIZE;
    // World-pixel of the canvas top-left corner.
    const originX = centerX - width / 2;
    const originY = centerY - height / 2;

    const firstCol = Math.floor(originX / TILE_SIZE);
    const lastCol = Math.floor((originX + width) / TILE_SIZE);
    const firstRow = Math.floor(originY / TILE_SIZE);
    const lastRow = Math.floor((originY + height) / TILE_SIZE);

    const jobs = [];
    for (let col = firstCol; col <= lastCol; col++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const tx = ((col % n) + n) % n; // wrap X at the antimeridian
        if (row < 0 || row >= n) continue; // no tiles past the poles
        jobs.push(
          loadTile(`https://tile.openstreetmap.org/${zoom}/${tx}/${row}.png`).then((img) => ({
            img,
            dx: col * TILE_SIZE - originX,
            dy: row * TILE_SIZE - originY,
          })),
        );
      }
    }

    const tiles = await Promise.all(jobs);
    if (!tiles.some((t) => t.img)) return null; // nothing loaded → no map

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, width, height);
    for (const { img, dx, dy } of tiles) {
      if (img) ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
    }

    // Center pin.
    const px = width / 2;
    const py = height / 2;
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#dc2626";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * Rasterise a rendered poster DOM node and return an A4 PDF as a Blob.
 * The node must have a 794:1123 (A4) aspect ratio.
 */
export async function posterNodeToPdfBlob(node) {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#ffffff",
  });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297);
  return pdf.output("blob");
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Share a generated PDF file. Uses the Web Share API with files when available
 * (also works in Capacitor's Chromium WebView); otherwise falls back to a
 * download. Returns the method used. Throws AbortError if the user cancels.
 */
export async function sharePdf(blob, { filename, title }) {
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ files: [file], title });
    return "shared";
  }
  downloadBlob(blob, filename);
  return "download";
}

/** Filesystem-safe poster filename from an optional cat name. */
export function posterFilename(catName) {
  const slug = (catName || "cat")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cat";
  return `missing-${slug}.pdf`;
}
