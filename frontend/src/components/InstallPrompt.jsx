import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { track } from "../analytics";
import { isNativePlatform } from "../lib/platform";

const DISMISS_KEY = "catmap_install_dismissed";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/** Custom install banner: native prompt on Android/desktop, hint on iOS. */
export default function InstallPrompt() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isNativePlatform() || localStorage.getItem(DISMISS_KEY) || isStandalone()) return undefined;

    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS never fires the event — show a one-time hint instead.
    let t;
    if (isIos()) {
      t = setTimeout(() => {
        setIosHint(true);
        setVisible(true);
      }, 4000);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      clearTimeout(t);
    };
  }, []);

  function dismiss() {
    track("pwa_dismiss");
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    track("pwa_install", { outcome });
    setDeferred(null);
    dismiss();
  }

  useEffect(() => {
    if (visible) track("pwa_prompt", { platform: iosHint ? "ios" : "other" });
  }, [visible, iosHint]);

  if (!visible) return null;

  return (
    <div className="install-banner" role="dialog" aria-label={t("install.ariaLabel")}>
      <span className="install-icon">🐱</span>
      <div className="install-text">
        <strong>{t("install.title")}</strong>
        <span>{iosHint ? t("install.iosHint") : t("install.body")}</span>
      </div>
      {!iosHint && (
        <button className="btn btn-primary install-action" onClick={install}>
          {t("install.action")}
        </button>
      )}
      <button className="install-close" aria-label={t("install.dismiss")} onClick={dismiss}>
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}
