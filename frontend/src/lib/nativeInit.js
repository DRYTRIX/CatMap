import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { isNativePlatform } from "./platform";

/** Configure status bar, splash screen, and Android hardware back button. */
export function initNativeApp({ onBackButton }) {
  if (!isNativePlatform()) return undefined;

  void (async () => {
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#0f172a" });
    } catch {
      /* plugin unavailable */
    }

    try {
      await SplashScreen.hide();
    } catch {
      /* plugin unavailable */
    }
  })();

  const listener = App.addListener("backButton", ({ canGoBack }) => {
    if (onBackButton?.()) return;
    if (canGoBack) {
      window.history.back();
      return;
    }
    App.minimizeApp();
  });

  return () => {
    void listener.then((handle) => handle.remove());
  };
}
