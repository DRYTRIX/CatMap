import { useEffect, useState } from "react";
import { track } from "../analytics";

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
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) || isStandalone()) return undefined;

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
    <div className="install-banner" role="dialog" aria-label="Install CatMap">
      <span className="install-icon">🐱</span>
      <div className="install-text">
        <strong>Install CatMap</strong>
        <span>
          {iosHint
            ? "Tap Share, then “Add to Home Screen.”"
            : "Add it to your home screen for the full app."}
        </span>
      </div>
      {!iosHint && (
        <button className="btn btn-primary install-action" onClick={install}>
          Install
        </button>
      )}
      <button className="install-close" aria-label="Dismiss" onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}
