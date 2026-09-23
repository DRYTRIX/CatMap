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

/**
 * Convert an EXIF DMS rational string ("D/1,M/1,S/100") to decimal degrees.
 * This is androidx.exifinterface's `ExifInterface.getAttribute()` format for
 * GPSLatitude/GPSLongitude — a well-documented, stable format independent of
 * any particular picker plugin.
 */
function parseDmsRational(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(",").map((p) => {
    const [num, den] = p.split("/").map(Number);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  });
  if (parts.length !== 3 || parts.some((p) => p == null)) return null;
  const [deg, min, sec] = parts;
  return deg + min / 60 + sec / 3600;
}

/**
 * iOS shape (ImageIO's GPS property dictionary, as surfaced by
 * @capacitor/camera's `metadata.exif`): `{ GPS: { Latitude, LatitudeRef,
 * Longitude, LongitudeRef } }`, decimal degrees, sign given by the Ref.
 */
function parseIosExifGps(data) {
  const gps = data?.GPS;
  if (!gps || gps.Latitude == null || gps.Longitude == null) return null;
  const latitude = Number(gps.Latitude) * (gps.LatitudeRef === "S" ? -1 : 1);
  const longitude = Number(gps.Longitude) * (gps.LongitudeRef === "W" ? -1 : 1);
  return { latitude, longitude };
}

/**
 * Android shape: a flat object of raw androidx ExifInterface tags, e.g.
 * `{ GPSLatitude: "40/1,26/1,839/100", GPSLatitudeRef: "N", ... }`.
 */
function parseAndroidExifGps(data) {
  const latRaw = data?.GPSLatitude;
  const lngRaw = data?.GPSLongitude;
  if (!latRaw || !lngRaw) return null;
  const latAbs = parseDmsRational(latRaw);
  const lngAbs = parseDmsRational(lngRaw);
  if (latAbs == null || lngAbs == null) return null;
  const latitude = latAbs * (data.GPSLatitudeRef === "S" ? -1 : 1);
  const longitude = lngAbs * (data.GPSLongitudeRef === "W" ? -1 : 1);
  return { latitude, longitude };
}

/**
 * Parse GPS out of the `metadata.exif` blob returned by @capacitor/camera's
 * `takePhoto`/`chooseFromGallery` (native only, requires `includeMetadata:
 * true`). Needed because the plugin always re-encodes the returned image
 * file, which strips EXIF from the bytes — `readGpsFromFile` only works for
 * the web `<input type="file">` picker.
 *
 * The plugin's TypeScript types claim `exif` is a `string`, but as of
 * @capacitor/camera 8 it ships as an already-parsed object on both
 * platforms; this accepts either. The shape itself isn't documented by the
 * plugin, so this is best-effort: unrecognized shapes return null instead of
 * throwing, and callers must still fall back to manual/device location.
 */
export function parseNativeExifGps(exif) {
  if (!exif) return null;
  try {
    const data = typeof exif === "string" ? JSON.parse(exif) : exif;
    const gps = parseIosExifGps(data) || parseAndroidExifGps(data);
    return isValidGps(gps) ? gps : null;
  } catch (err) {
    console.warn("Native EXIF GPS parse failed for this photo.", err);
    return null;
  }
}

/** Read GPS from a native MediaResult's `metadata` (see parseNativeExifGps). */
export function readNativeExifGps(metadata) {
  return parseNativeExifGps(metadata?.exif);
}
