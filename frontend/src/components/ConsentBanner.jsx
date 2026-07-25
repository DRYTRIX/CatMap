import { useState } from "react";
import { useTranslation } from "react-i18next";
import { denyAnalyticsConsent, grantAnalyticsConsent } from "../analytics";

/** Cookie consent for GA4 (Consent Mode v2). Shown once until the user chooses. */
export default function ConsentBanner() {
  const { t } = useTranslation();
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
    <div className="consent-banner" role="dialog" aria-label={t("consent.ariaLabel")}>
      <p className="consent-text">
        {t("consent.text")} {t("consent.seeOur")}{" "}
        <a href="/privacy.html">{t("consent.privacyPolicy")}</a> {t("consent.or")}{" "}
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("consent.googlePrivacy")}
        </a>
        .
      </p>
      <div className="consent-actions">
        <button type="button" className="btn btn-ghost consent-btn" onClick={decline}>
          {t("consent.decline")}
        </button>
        <button type="button" className="btn btn-primary consent-btn" onClick={accept}>
          {t("consent.accept")}
        </button>
      </div>
    </div>
  );
}
