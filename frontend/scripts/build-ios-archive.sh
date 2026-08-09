#!/usr/bin/env bash
# Archive a signed iOS IPA for App Store / TestFlight upload.
# Requires macOS + Xcode. Prefer CI (tag release) for production builds.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_APP="$ROOT/ios/App"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "iOS archives require macOS with Xcode."
  echo "On Linux, push a semver tag (vX.Y.Z) to build the IPA in GitHub Actions."
  echo "See frontend/ios/RELEASE.md"
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild not found. Install Xcode from the App Store."
  exit 1
fi

VERSION="${APP_VERSION_NAME:-}"
VERSION_CODE="${APP_VERSION_CODE:-}"
TEAM_ID="${APPLE_TEAM_ID:-}"

if [[ -z "$VERSION" || -z "$VERSION_CODE" ]]; then
  echo "Set APP_VERSION_NAME and APP_VERSION_CODE (e.g. 1.0.1 and 1000001)."
  echo "CI derives these from the git tag automatically."
  exit 1
fi

if [[ -z "$TEAM_ID" ]]; then
  echo "Set APPLE_TEAM_ID to your Apple Developer Team ID."
  exit 1
fi

bash "$ROOT/scripts/build-mobile.sh"

ARCHIVE_PATH="${ARCHIVE_PATH:-$IOS_APP/build/App.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-$IOS_APP/build/export}"
mkdir -p "$IOS_APP/build"

cd "$IOS_APP"
xcodebuild -resolvePackageDependencies -project App.xcodeproj -scheme App

xcodebuild archive \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  MARKETING_VERSION="$VERSION" \
  CURRENT_PROJECT_VERSION="$VERSION_CODE" \
  DEVELOPMENT_TEAM="$TEAM_ID"

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist ExportOptions.plist \
  -allowProvisioningUpdates

echo ""
echo "IPA: $(ls "$EXPORT_PATH"/*.ipa 2>/dev/null | head -n1)"
