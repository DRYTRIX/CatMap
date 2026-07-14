import { isNativePlatform } from "./platform";

/** Base URL for share links and deep links shown to other users. */
export function publicSiteUrl() {
  const configured = (import.meta.env.VITE_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (configured) return configured;
  if (isNativePlatform()) return "https://catmap.drytrix.com";
  return window.location.origin;
}

export function sightingShareUrl(id) {
  return `${publicSiteUrl()}/s/${id}`;
}
