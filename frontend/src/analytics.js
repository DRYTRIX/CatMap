const CONSENT_KEY = "catmap_analytics_consent";

function measurementId() {
  const runtime = typeof window !== "undefined" && window.__CATMAP_ENV__?.gaMeasurementId;
  const baked = import.meta.env.VITE_GA_MEASUREMENT_ID;
  return (runtime || baked || "").trim();
}

/** GA4 is configured and this is a production build. */
export function isAnalyticsConfigured() {
  const id = measurementId();
  return Boolean(id) && !import.meta.env.DEV;
}

function readConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

function writeConsent(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* private browsing */
  }
}

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
}

function setDefaultConsent() {
  ensureGtag();
  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

let initialized = false;

export function initAnalytics() {
  if (!isAnalyticsConfigured() || initialized) return;

  setDefaultConsent();
  window.gtag("consent", "update", { analytics_storage: "granted" });

  const script = document.createElement("script");
  script.async = true;
  const id = measurementId();
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", id, {
    send_page_view: true,
    anonymize_ip: true,
  });

  initialized = true;
}

export function grantAnalyticsConsent() {
  if (!isAnalyticsConfigured()) return;
  writeConsent("granted");
  initAnalytics();
  track("consent_granted");
  track("app_open");
  if (new URLSearchParams(window.location.search).get("s")) {
    track("deep_link_open");
  }
}

export function denyAnalyticsConsent() {
  if (!isAnalyticsConfigured()) return;
  writeConsent("denied");
}

/** Restore consent from a previous visit, or show the banner when unset. */
export function bootstrapAnalytics() {
  if (!isAnalyticsConfigured()) return { needsConsent: false };

  setDefaultConsent();
  const consent = readConsent();
  if (consent === "granted") {
    initAnalytics();
    return { needsConsent: false };
  }
  if (consent === "denied") return { needsConsent: false };
  return { needsConsent: true };
}

export function track(event, params = {}) {
  if (!isAnalyticsConfigured() || !initialized || !window.gtag) return;
  window.gtag("event", event, params);
}
