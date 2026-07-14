import { Share } from "@capacitor/share";
import { isNativePlatform } from "./platform";

/**
 * Share a sighting link (and optional photo file) via native share sheet or Web Share API.
 * Returns the method used: "native_with_photo" | "native" | "clipboard" | "manual".
 */
export async function shareSighting({ title, url, file }) {
  if (isNativePlatform()) {
    await Share.share({
      title,
      text: title,
      url,
      dialogTitle: title,
    });
    return file ? "native_with_photo" : "native";
  }

  const shareData = { title, url };
  if (file && navigator.canShare?.({ files: [file] })) {
    shareData.files = [file];
  }

  if (navigator.share) {
    await navigator.share(shareData);
    return shareData.files ? "native_with_photo" : "native";
  }

  throw new Error("share_unavailable");
}
