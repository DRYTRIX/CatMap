/**
 * Promise wrapper around navigator.geolocation.getCurrentPosition.
 *
 * Defaults to `maximumAge: 60000` so a recent cached fix is returned instantly
 * on repeat calls (the main reason locating felt slow before). Pass
 * `highAccuracy: true` only when precision matters (placing a pin); leave it
 * false for merely centering the map, where network/wifi location is fast.
 */
export function getPosition({
  highAccuracy = false,
  timeout = 8000,
  maximumAge = 60000,
} = {}) {
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
