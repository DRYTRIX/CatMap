import { subscribePush } from "../api";
import { isNativePlatform } from "./platform";

let registered = false;

/** Register FCM/APNs push token on native Android/iOS (no-op when plugin unavailable). */
export async function registerNativePush({ alertLat, alertLng, alertRadiusKm } = {}) {
  if (!isNativePlatform() || registered) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token) => {
      if (!token?.value) return;
      // Android: FCM token. iOS: APNs device token from Capacitor (FCM when Firebase Messaging is wired).
      await subscribePush({
        platform: "fcm",
        subscription: token.value,
        alertLat,
        alertLng,
        alertRadiusKm,
      });
    });

    PushNotifications.addListener("registrationError", () => {
      /* Push not configured — inbox still works */
    });

    registered = true;
  } catch {
    /* plugin missing or native push config not present */
  }
}
