import i18n from "../i18n";

/** Map known backend `detail` strings to i18n keys. */
const ERROR_MAP = {
  "Too many requests — Try Again Later.": "errors.tooManyRequests",
  "Sighting not found.": "errors.notFound",
  "Not your sighting.": "errors.notYourSighting",
  "No image provided.": "errors.noImage",
  "Empty upload.": "errors.emptyUpload",
  "No location provided and none found in the photo.": "errors.noLocation",
  "Coordinates out of range.": "errors.coordsOutOfRange",
  "Cat detection is temporarily unavailable. Please try again later.":
    "errors.catDetectionUnavailable",
  "That photo doesn't look like a cat.": "errors.notACat",
  "Network error during upload.": "errors.networkUpload",
  "Search failed": "errors.searchFailed",
};

const UPLOAD_SIZE_RE = /^Image exceeds (\d+) MB limit\.$/;

/**
 * Translate an API error message when a known mapping exists; otherwise return as-is.
 */
export function translateApiError(message) {
  if (!message || typeof message !== "string") return message;

  const key = ERROR_MAP[message];
  if (key) return i18n.t(key);

  const uploadMatch = message.match(UPLOAD_SIZE_RE);
  if (uploadMatch) {
    return i18n.t("errors.uploadTooLarge", { mb: uploadMatch[1] });
  }

  const requestMatch = message.match(/^Request failed \((\d+)\)$/);
  if (requestMatch) {
    return i18n.t("errors.requestFailed", { status: requestMatch[1] });
  }

  return message;
}
