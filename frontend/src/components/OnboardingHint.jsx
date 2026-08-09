import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { track } from "../analytics";

const DISMISS_KEY = "catmap_onboarding_dismissed";
const STEPS = ["welcome", "sightingVsMissing", "confirmReport", "permissions"];

/** Short multi-step onboarding for first-time visitors. */
export default function OnboardingHint() {
  const { t } = useTranslation();
  const [step, setStep] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) ? -1 : 0;
    } catch {
      return -1;
    }
  });

  function dismiss() {
    track("onboarding_dismiss", { step: STEPS[Math.max(0, step)] });
    setStep(-1);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private browsing */
    }
  }

  function next() {
    if (step >= STEPS.length - 1) {
      dismiss();
      return;
    }
    track("onboarding_next", { step: STEPS[step] });
    setStep((s) => s + 1);
  }

  if (step < 0) return null;

  const key = STEPS[step];

  return (
    <div className="onboarding-hint onboarding-card" role="dialog" aria-labelledby="onboarding-title">
      <div className="onboarding-body">
        <strong id="onboarding-title">{t(`onboarding.${key}Title`)}</strong>
        <p className="onboarding-text">{t(`onboarding.${key}Body`, { action: t("header.addCat") })}</p>
        <div className="onboarding-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
            {t("onboarding.skip")}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={next}>
            {step >= STEPS.length - 1 ? t("onboarding.done") : t("onboarding.next")}
          </button>
        </div>
      </div>
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
