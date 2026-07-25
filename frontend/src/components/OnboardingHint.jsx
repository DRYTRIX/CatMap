import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { track } from "../analytics";

const DISMISS_KEY = "catmap_onboarding_dismissed";

/** One-time hint encouraging users to add their first cat sighting. */
export default function OnboardingHint() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(DISMISS_KEY);
    } catch {
      return false;
    }
  });

  function dismiss() {
    track("onboarding_dismiss");
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private browsing */
    }
  }

  if (!visible) return null;

  return (
    <div className="onboarding-hint" role="status">
      <span className="onboarding-text">
        {t("onboarding.hint", { action: t("header.addCat") })}
      </span>
      <button
        type="button"
        className="onboarding-close"
        aria-label={t("onboarding.dismiss")}
        onClick={dismiss}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}
