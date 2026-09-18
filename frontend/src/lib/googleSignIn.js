import { isNativePlatform } from "./platform";

let gisPromise = null;

function loadGoogleIdentityServices() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google.accounts.id);
      return;
    }
    const existing = document.querySelector("script[data-gis]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google.accounts.id));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.gis = "1";
    script.onload = () => resolve(window.google.accounts.id);
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return gisPromise;
}

/** Render a Google Sign-In button into `container` and call onCredential with the ID token. */
export async function signInWithGoogleWeb(container, clientId, onCredential) {
  if (!clientId || !container) return;
  const accounts = await loadGoogleIdentityServices();
  accounts.initialize({
    client_id: clientId,
    callback: (response) => {
      if (response?.credential) onCredential(response.credential);
    },
  });
  container.innerHTML = "";
  accounts.renderButton(container, {
    theme: "outline",
    size: "large",
    width: Math.min(320, container.clientWidth || 280),
    text: "continue_with",
  });
}

/**
 * Native Google sign-in via Capacitor Firebase Authentication when available.
 * Returns an ID token string suitable for POST /api/auth/google.
 */
export async function signInWithGoogleNative() {
  if (!isNativePlatform()) {
    throw new Error("Native Google sign-in is only available in the app.");
  }
  try {
    const { FirebaseAuthentication } = await import(
      "@capacitor-firebase/authentication"
    );
    const result = await FirebaseAuthentication.signInWithGoogle();
    const token =
      result?.credential?.idToken ||
      result?.user?.idToken ||
      (await FirebaseAuthentication.getIdToken())?.token;
    if (!token) throw new Error("No ID token from Google sign-in.");
    return token;
  } catch (err) {
    if (err?.message?.includes("Cannot find module") || err?.code === "MODULE_NOT_FOUND") {
      throw new Error(
        "Google sign-in plugin is not installed. Use email/password or update the app."
      );
    }
    throw err;
  }
}
