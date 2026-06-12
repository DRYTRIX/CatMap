import * as Sentry from "@sentry/react";

function dsn() {
  const runtime = typeof window !== "undefined" && window.__CATMAP_ENV__?.sentryDsn;
  const baked = import.meta.env.VITE_SENTRY_DSN;
  return (runtime || baked || "").trim();
}

/** Starts Sentry error tracking when a DSN is configured (production builds only). */
export function initSentry() {
  if (import.meta.env.DEV) return;
  const sentryDsn = dsn();
  if (!sentryDsn) return;

  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
