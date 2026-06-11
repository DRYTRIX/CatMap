import { useState } from "react";
import { track } from "../analytics";

const DISMISS_KEY = "catmap_onboarding_dismissed";

/** One-time hint encouraging users to add their first cat sighting. */
export default function OnboardingHint() {
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
        Tap <strong>Add cat</strong> to pin your first sighting on the map.
      </span>
      <button type="button" className="onboarding-close" aria-label="Dismiss" onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}
