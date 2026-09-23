import { Camera } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { isNativePlatform } from "./platform";
import { readNativeExifGps } from "./photoGps";

/** True when photos should be picked via Capacitor Camera instead of `<input type="file">`. */
export function useNativePhotoPicker() {
  return isNativePlatform();
}

// `File` doesn't carry custom properties by default; this is a plain data bag
// callers (AddSightingModal) can read the same way as an EXIF-from-bytes read.
function attachGps(file, metadata) {
  file.gps = readNativeExifGps(metadata);
  return file;
}

async function mediaResultToFile(result, index = 0) {
  const path = result.webPath;
  if (!path) throw new Error("No photo path returned.");

  const url = path.startsWith("http") || path.startsWith("capacitor:")
    ? path
    : Capacitor.convertFileSrc(path);

  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not read the selected photo.");
  const blob = await res.blob();

  const format = (result.metadata?.format || "jpeg").replace("jpg", "jpeg");
  const mime = blob.type || `image/${format}`;
  const ext = format === "jpeg" ? "jpg" : format;

  const file = new File([blob], `photo-${Date.now()}-${index}.${ext}`, { type: mime });
  return attachGps(file, result.metadata);
}

function isUserCancel(err) {
  return (
    err?.message?.includes("User cancelled") ||
    err?.message?.includes("canceled") ||
    err?.message?.includes("Cancelled") ||
    err?.code === "USER_CANCELLED"
  );
}

/**
 * Open the native camera and return one File, with GPS (when the photo has
 * any) attached as `file.gps`. `takePhoto`/`chooseFromGallery` always
 * re-encode the saved image — which strips EXIF from the file itself — so
 * `includeMetadata: true` is the only way to recover GPS on native.
 * Returns an empty array when the user cancels.
 */
export async function pickNativePhotoFromCamera() {
  if (!isNativePlatform()) return [];
  try {
    const result = await Camera.takePhoto({
      quality: 90,
      correctOrientation: true,
      includeMetadata: true,
    });
    return [await mediaResultToFile(result)];
  } catch (err) {
    if (isUserCancel(err)) return [];
    throw err;
  }
}

/**
 * Open the native gallery picker and return one File per selection, with GPS
 * (when present) attached as `file.gps` on each — see pickNativePhotoFromCamera.
 * Returns an empty array when the user cancels.
 */
export async function pickNativePhotosFromGallery(limit = 0) {
  if (!isNativePlatform()) return [];
  try {
    const { results } = await Camera.chooseFromGallery({
      allowMultipleSelection: true,
      limit,
      quality: 90,
      correctOrientation: true,
      includeMetadata: true,
    });
    return Promise.all(results.map((r, i) => mediaResultToFile(r, i)));
  } catch (err) {
    if (isUserCancel(err)) return [];
    throw err;
  }
}
