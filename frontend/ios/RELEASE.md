# CatMap iOS — App Store Release Guide

## Automated release (recommended)

Releases are triggered by pushing a **semver git tag**. This deploys backend and frontend to Render, builds a signed Android APK + AAB **and** a signed iOS IPA, and publishes a GitHub Release with all artifacts attached.

### Release a new version

```bash
git tag v1.0.1
git push origin v1.0.1
```

Tag format must be `vMAJOR.MINOR.PATCH` (e.g. `v1.0.1`, `v2.3.0`). Invalid tags are rejected by CI.

The workflow ([`.github/workflows/release.yml`](../../.github/workflows/release.yml)) automatically:

1. Validates the tag format
2. Deploys `catmap-backend` and `catmap-frontend` on Render (at the tagged commit)
3. Builds signed Android APK/AAB (Ubuntu) and a signed iOS IPA (macOS)
4. Creates a GitHub Release with APK, AAB, and IPA attached

Download the IPA from the GitHub Release and upload it to App Store Connect (TestFlight or App Store).

### One-time setup

#### Apple Developer / App Store Connect

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/).
2. Create an App ID with bundle ID `com.drytrix.catmap` and enable **Push Notifications**.
3. Create the app in [App Store Connect](https://appstoreconnect.apple.com/) with the same bundle ID.
4. Create an **App Store Connect API key** (Users and Access → Integrations → App Store Connect API):
   - Role: **App Manager** (or Admin)
   - Download the `.p8` private key (shown once)
   - Note the **Key ID** and **Issuer ID**
5. Note your **Team ID** (Membership details in the Apple Developer account).

#### GitHub secrets (iOS)

| Secret | Value |
|--------|-------|
| `APPLE_TEAM_ID` | 10-character Team ID |
| `APP_STORE_CONNECT_KEY_ID` | API Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer UUID |
| `APP_STORE_CONNECT_PRIVATE_KEY_BASE64` | `base64 -w0 AuthKey_XXXXX.p8` (Linux) or `base64 -i AuthKey_XXXXX.p8` (macOS) |
| `IOS_GOOGLE_SERVICE_INFO_PLIST` | Full contents of `frontend/ios/App/App/GoogleService-Info.plist` |

Android secrets remain required for the same workflow (see [`frontend/android/RELEASE.md`](../android/RELEASE.md)).

### Version numbering

Version is derived from the git tag — do **not** edit Xcode version fields manually for releases.

| Tag | MARKETING_VERSION | CURRENT_PROJECT_VERSION |
|-----|-------------------|-------------------------|
| `v1.0.0` | `1.0.0` | `1000000` |
| `v1.0.1` | `1.0.1` | `1000001` |
| `v1.2.3` | `1.2.3` | `1002003` |

Formula: `CURRENT_PROJECT_VERSION = major × 1_000_000 + minor × 1_000 + patch` (same as Android `versionCode`).

---

## Manual local build (optional, macOS only)

iOS cannot be archived on Linux. Use a Mac with Xcode, or rely on CI.

### Prerequisites

- macOS with Xcode installed (and command-line tools)
- Apple Developer account + team selected in Xcode
- Node.js + npm (same as frontend README)

```bash
cd frontend
npm install
npm run cap:sync          # builds web assets and syncs android + ios
npm run cap:assets        # icons for android + ios
npm run cap:open:ios      # opens Xcode
```

### Archive from the CLI

```bash
export APPLE_TEAM_ID=XXXXXXXXXX
export APP_VERSION_NAME=1.0.1
export APP_VERSION_CODE=1000001
npm run ios:archive
# IPA under frontend/ios/App/build/export/
```

Or in Xcode: open `ios/App/App.xcodeproj` → Signing & Capabilities (select team) → Product → Archive → Distribute.

---

## Push notifications (FCM + APNs)

Native iOS push uses `@capacitor/push-notifications`. Tokens are registered with the backend as `platform: "fcm"` (same path as Android). Upload an APNs key to Firebase so FCM can deliver to iOS devices.

### One-time Firebase + APNs setup

1. [Apple Developer](https://developer.apple.com/account/resources/authkeys/list) → create a **Keys** entry with Apple Push Notifications service (APNs) enabled → download `.p8`.
2. [Firebase Console](https://console.firebase.google.com/) → same project as Android (`com-drytrix-catmap`) → **Add iOS app** with bundle ID `com.drytrix.catmap`.
3. Project Settings → Cloud Messaging → **APNs Authentication Key** → upload the APNs `.p8` (Key ID + Team ID).
4. Download `GoogleService-Info.plist` → place at `frontend/ios/App/App/GoogleService-Info.plist` (gitignored).
5. Add the same file contents as GitHub secret `IOS_GOOGLE_SERVICE_INFO_PLIST`.
6. Ensure Render `catmap-backend` still has `FCM_SERVICE_ACCOUNT_JSON` (shared with Android).
7. In Xcode, confirm the App target has **Push Notifications** capability (already enabled in the project entitlements).

Capacitor’s iOS registration callback currently surfaces the **APNs device token**. For end-to-end FCM token parity with Android, add the Firebase Messaging SDK (or a Capacitor Firebase messaging plugin) so the client obtains an FCM registration token. Until then, inbox still works; remote FCM delivery to iOS may require that extra native step.

Web Push (browser/PWA) uses VAPID instead — see Android RELEASE.md.

---

## Backend / CORS

Same as Android: the mobile WebView origin `https://localhost` must stay in `CORS_ORIGINS` on Render.

---

## Testing checklist

- [ ] Map loads OSM tiles and sighting markers
- [ ] "Locate me" prompts for location permission and centers map
- [ ] Add sighting: camera/gallery picker, photo upload, geolocation
- [ ] Sighting detail: confirm, share (`https://catmap.drytrix.com/s/{id}`), report
- [ ] Cat profiles, favorites, filters, recent feed, my sightings
- [ ] Offline toast appears when connectivity is lost
- [ ] Push permission prompt (when Firebase/APNs configured)

---

## App Store Connect submission

### App details
| Field | Suggested value |
|-------|-----------------|
| App name | CatMap |
| Bundle ID | `com.drytrix.catmap` |
| Category | Navigation or Entertainment |
| Privacy policy URL | `https://catmap.drytrix.com/privacy.html` |

### Required assets
- App icon (generated via `npm run cap:assets`)
- Screenshots for required device sizes
- Privacy nutrition labels: location, photos, device identifiers (anonymous `X-Device-Token`)

### Release steps
1. Download `catmap-vX.Y.Z.ipa` from the GitHub Release
2. Upload via Transporter, `xcrun altool`, or Xcode Organizer
3. Submit for TestFlight and/or App Store review

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ios:archive` on Linux | Expected — use CI tag release or a Mac |
| Signing / provisioning errors in CI | Check Team ID, API key role (App Manager), and that App ID `com.drytrix.catmap` exists with Push |
| Missing `GoogleService-Info.plist` | Add local file or `IOS_GOOGLE_SERVICE_INFO_PLIST` secret |
| SPM resolve failures | Run `xcodebuild -resolvePackageDependencies` after `npm ci` / `cap sync` |
| CORS errors in WebView | Redeploy backend with `https://localhost` in `CORS_ORIGINS` |
