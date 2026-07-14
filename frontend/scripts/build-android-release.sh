#!/usr/bin/env bash
# Build a signed release AAB for Play Store upload.
# Requires keystore.properties (see keystore.properties.example).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"

if [ ! -f "$ANDROID_DIR/keystore.properties" ]; then
  echo "Missing $ANDROID_DIR/keystore.properties"
  echo "Copy keystore.properties.example and fill in your upload keystore details."
  echo "Or run: bash $ANDROID_DIR/scripts/create-keystore.sh"
  exit 1
fi

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
if [ ! -d "$JAVA_HOME" ]; then
  export JAVA_HOME="/tmp/jdk-21"
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

bash "$ROOT/scripts/build-mobile.sh"

cd "$ANDROID_DIR"
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew bundleRelease "$@"

echo ""
echo "Release AAB: $ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
