import { subscribePush } from "../api";
import { isNativePlatform } from "./platform";

let registered = false;

/** Register FCM token on native Android (no-op when plugin unavailable). */
export async function registerNativePush({ alertLat, alertLng, alertRadiusKm } = {}) {
  if (!isNativePlatform() || registered) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token) => {
      if (!token?.value) return;
      await subscribePush({
        platform: "fcm",
        subscription: token.value,
        alertLat,
        alertLng,
        alertRadiusKm,
      });
    });

    PushNotifications.addListener("registrationError", () => {
      /* FCM not configured — inbox still works */
    });

    registered = true;
  } catch {
    /* plugin missing or google-services.json not present */
  }
}
