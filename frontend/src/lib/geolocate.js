import { Geolocation } from "@capacitor/geolocation";
import { isNativePlatform } from "./platform";

/**
 * Promise wrapper around navigator.geolocation.getCurrentPosition.
 *
 * On Capacitor native, uses @capacitor/geolocation so Android runtime
 * permission prompts work correctly.
 *
 * Defaults to `maximumAge: 60000` so a recent cached fix is returned instantly
 * on repeat calls (the main reason locating felt slow before). Pass
 * `highAccuracy: true` only when precision matters (placing a pin); leave it
 * false for merely centering the map, where network/wifi location is fast.
 */
export async function getPosition({
  highAccuracy = false,
  timeout = 8000,
  maximumAge = 60000,
} = {}) {
  if (isNativePlatform()) {
    const permission = await Geolocation.checkPermissions();
    if (permission.location === "denied") {
      const requested = await Geolocation.requestPermissions();
      if (requested.location === "denied") {
        throw new Error("Location permission denied.");
      }
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: highAccuracy,
      timeout,
      maximumAge,
    });

    return {
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      },
    };
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: highAccuracy,
      timeout,
      maximumAge,
    });
  });
}
