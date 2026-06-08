import imageCompressionImport from "browser-image-compression";

const imageCompression = imageCompressionImport?.default ?? imageCompressionImport;

/**
 * Downscale/compress a photo for upload. The backend also resizes, but doing
 * it client-side makes mobile uploads dramatically faster.
 *
 * IMPORTANT: read EXIF GPS from the ORIGINAL file before calling this —
 * compression strips metadata.
 *
 * Returns the original file unchanged if compression fails for any reason.
 */
export async function compressImage(file) {
  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.82,
  };
  try {
    const compressed = await imageCompression(file, options);
    // Give it a sensible filename/extension for the multipart upload.
    return new File([compressed], renameToJpeg(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function renameToJpeg(name) {
  if (!name) return "cat.jpg";
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
