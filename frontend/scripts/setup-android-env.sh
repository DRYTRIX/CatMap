#!/usr/bin/env bash
# Install JDK 21 and Android SDK for CatMap Capacitor builds.
# Run from repo root: bash frontend/scripts/setup-android-env.sh
set -euo pipefail

SDK_ROOT="${ANDROID_HOME:-$HOME/Android/Sdk}"
CMDLINE_TOOLS="$SDK_ROOT/cmdline-tools/latest"
PORTABLE_JDK="/tmp/jdk-21"

install_portable_jdk() {
  if [ -x "$PORTABLE_JDK/bin/java" ]; then
    export JAVA_HOME="$PORTABLE_JDK"
    return 0
  fi
  echo "==> Downloading portable JDK 21 (no sudo required)"
  mkdir -p /tmp/jdk-download
  wget -q -O /tmp/jdk-download/jdk21.tar.gz \
    "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
  rm -rf "$PORTABLE_JDK"
  mkdir -p "$PORTABLE_JDK"
  tar -xzf /tmp/jdk-download/jdk21.tar.gz -C "$PORTABLE_JDK" --strip-components=1
  export JAVA_HOME="$PORTABLE_JDK"
}

echo "==> Installing OpenJDK 21 (Gradle/AGP require JDK 17–21)"
if [ -d "/usr/lib/jvm/java-21-openjdk-amd64" ]; then
  export JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
elif command -v apt-get >/dev/null 2>&1; then
  if sudo -n apt-get update -qq 2>/dev/null; then
    sudo apt-get install -y openjdk-21-jdk unzip wget
    export JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
  else
    install_portable_jdk
  fi
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y java-21-openjdk-devel unzip wget
  export JAVA_HOME="/usr/lib/jvm/java-21-openjdk"
else
  install_portable_jdk
fi

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "JDK 21 not found. Set JAVA_HOME manually and re-run."
  exit 1
fi

echo "==> Using JAVA_HOME=$JAVA_HOME"
"$JAVA_HOME/bin/java" -version

echo "==> Downloading Android command-line tools"
mkdir -p "$SDK_ROOT/cmdline-tools"
TMP_ZIP="$(mktemp /tmp/cmdline-tools.XXXXXX.zip)"
wget -q -O "$TMP_ZIP" \
  "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
rm -rf "$CMDLINE_TOOLS"
mkdir -p "$CMDLINE_TOOLS"
unzip -q "$TMP_ZIP" -d "$CMDLINE_TOOLS"
# Zip extracts to cmdline-tools/bin — move up one level into latest/
if [ -d "$CMDLINE_TOOLS/cmdline-tools" ]; then
  mv "$CMDLINE_TOOLS/cmdline-tools/"* "$CMDLINE_TOOLS/"
  rmdir "$CMDLINE_TOOLS/cmdline-tools"
fi
rm -f "$TMP_ZIP"

export ANDROID_HOME="$SDK_ROOT"
export PATH="$CMDLINE_TOOLS/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "==> Accepting SDK licenses"
yes | sdkmanager --licenses >/dev/null

echo "==> Installing platform-tools, build-tools 35, Android 35"
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

ENV_SNIPPET="# CatMap Android build environment
export JAVA_HOME=\"$JAVA_HOME\"
export ANDROID_HOME=\"$SDK_ROOT\"
export PATH=\"\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$PATH\""
PROFILE="$HOME/.bashrc"
if ! grep -q "CatMap Android build environment" "$PROFILE" 2>/dev/null; then
  echo "" >> "$PROFILE"
  echo "$ENV_SNIPPET" >> "$PROFILE"
fi

echo ""
echo "Done. Reload your shell or run:"
echo "  export JAVA_HOME=\"$JAVA_HOME\""
echo "  export ANDROID_HOME=\"$SDK_ROOT\""
echo "  export PATH=\"\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$PATH\""
