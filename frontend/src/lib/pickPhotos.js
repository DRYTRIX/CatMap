import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { isNativePlatform } from "./platform";

/** True when photos should be picked via Capacitor Camera instead of `<input type="file">`. */
export function useNativePhotoPicker() {
  return isNativePlatform();
}

async function photoToFile(photo) {
  const path = photo.webPath || photo.path;
  if (!path) throw new Error("No photo path returned.");

  const url = path.startsWith("http") || path.startsWith("capacitor:")
    ? path
    : Capacitor.convertFileSrc(path);

  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not read the selected photo.");
  const blob = await res.blob();

  const format = (photo.format || "jpeg").replace("jpg", "jpeg");
  const mime = blob.type || `image/${format}`;
  const ext = format === "jpeg" ? "jpg" : format;

  return new File([blob], `photo-${Date.now()}.${ext}`, { type: mime });
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
 * Open the native camera / gallery chooser and return one File.
 * Tap again to add more photos (same as web multi-select, but one at a time).
 * Returns an empty array when the user cancels.
 */
export async function pickNativePhotos() {
  if (!isNativePlatform()) return [];

  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.Uri,
      quality: 90,
      correctOrientation: true,
      allowEditing: false,
    });
    return [await photoToFile(photo)];
  } catch (err) {
    if (isUserCancel(err)) return [];
    throw err;
  }
}
