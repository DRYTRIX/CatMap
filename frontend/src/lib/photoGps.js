import exifrImport from "exifr";

const exifr = exifrImport?.default ?? exifrImport;

/** Android photo picker redacts GPS; file picker workaround needs a non-image MIME. */
export const ANDROID_FILE_ACCEPT = "image/*,text/plain";
export const DEFAULT_FILE_ACCEPT = "image/*";

export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function fileInputAccept() {
  return isAndroid() ? ANDROID_FILE_ACCEPT : DEFAULT_FILE_ACCEPT;
}

/** Keep only image files (Android workaround accept may include text/plain). */
export function filterImageFiles(fileList) {
  return Array.from(fileList).filter(
    (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name),
  );
}

export function isValidGps(gps) {
  if (!gps) return false;
  const { latitude: lat, longitude: lng } = gps;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // Some Android pickers zero out GPS instead of stripping it.
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

/** Read GPS from the original file bytes (call before compression). */
export async function readGpsFromFile(file) {
  try {
    const gps = await exifr.gps(file);
    return isValidGps(gps) ? gps : null;
  } catch (err) {
    console.warn("EXIF GPS read failed for this photo.", err);
    return null;
  }
}
