#!/usr/bin/env bash
# Build a debug APK for device testing. Requires JDK 21 + Android SDK.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
if [ ! -d "$JAVA_HOME" ]; then
  export JAVA_HOME="/tmp/jdk-21"
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

bash "$ROOT/scripts/build-mobile.sh"

cd "$ANDROID_DIR"
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug "$@"

echo ""
echo "Debug APK: $ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
echo "Install: adb install -r $ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
