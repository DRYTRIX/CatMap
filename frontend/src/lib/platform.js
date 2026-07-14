import { Capacitor } from "@capacitor/core";

/** True when running inside a Capacitor native shell (Android/iOS). */
export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}
