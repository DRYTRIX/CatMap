import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { getCreatedSet, hasBackedUp } from "../deviceToken";

const SESSION_DISMISS_KEY = "catmap_backup_banner_dismissed";

function shouldShow() {
  try {
    if (hasBackedUp()) return false;
    if (sessionStorage.getItem(SESSION_DISMISS_KEY)) return false;
    return getCreatedSet().size >= 1;
  } catch {
    return false;
  }
}

/**
 * Sticky reminder after the user has posted at least one cat and has not
 * exported their device identity. Dismiss lasts for this tab session only.
 */
export default function IdentityBackupBanner({ onBackup, refreshKey = 0 }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(shouldShow);

  useEffect(() => {
    setVisible(shouldShow());
  }, [refreshKey]);

  if (!visible) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      /* private browsing */
    }
    setVisible(false);
  }

  return (
    <div className="backup-banner" role="status">
      <div className="install-text">
        <strong>{t("identity.bannerTitle")}</strong>
        <span>{t("identity.bannerBody")}</span>
      </div>
      <button
        type="button"
        className="btn btn-primary install-action"
        onClick={() => {
          dismiss();
          onBackup?.();
        }}
      >
        {t("identity.bannerAction")}
      </button>
      <button
        type="button"
        className="install-close"
        aria-label={t("common.close")}
        onClick={dismiss}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}
