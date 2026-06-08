import { useState } from "react";
import { denyAnalyticsConsent, grantAnalyticsConsent } from "../analytics";

/** Cookie consent for GA4 (Consent Mode v2). Shown once until the user chooses. */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(true);

  function accept() {
    grantAnalyticsConsent();
    setVisible(false);
  }

  function decline() {
    denyAnalyticsConsent();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="consent-banner" role="dialog" aria-label="Analytics consent">
      <p className="consent-text">
        We use anonymous analytics to understand how CatMap is used and improve the
        experience. No photos, locations, or personal data are sent to Google.{" "}
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Privacy Policy
        </a>
      </p>
      <div className="consent-actions">
        <button type="button" className="btn btn-ghost consent-btn" onClick={decline}>
          Decline
        </button>
        <button type="button" className="btn btn-primary consent-btn" onClick={accept}>
          Accept
        </button>
      </div>
    </div>
  );
}
