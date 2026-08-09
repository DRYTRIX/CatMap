# CatMap Android — Play Store Release Guide

## Automated release (recommended)

Releases are triggered by pushing a **semver git tag**. This deploys backend and frontend to Render, builds a signed Android APK + AAB and a signed iOS IPA, and publishes a GitHub Release with the artifacts attached.

### Release a new version

```bash
git tag v1.0.1
git push origin v1.0.1
```

Tag format must be `vMAJOR.MINOR.PATCH` (e.g. `v1.0.1`, `v2.3.0`). Invalid tags are rejected by CI.

The workflow ([`.github/workflows/release.yml`](../../.github/workflows/release.yml)) automatically:

1. Validates the tag format
2. Deploys `catmap-backend` and `catmap-frontend` on Render (at the tagged commit)
3. Builds a signed release APK and AAB with `versionName` from the tag and a monotonically increasing `versionCode`, plus a signed iOS IPA with matching version numbers
4. Creates a GitHub Release with the APK, AAB, and IPA attached

Download the AAB from the GitHub Release and upload it to Google Play Console. Download the IPA for App Store Connect (see [`frontend/ios/RELEASE.md`](../ios/RELEASE.md)).

### One-time setup

#### Render

1. In the Render dashboard, turn **Auto-Deploy off** for `catmap-backend` and `catmap-frontend` (otherwise every push to `main` still deploys).
2. For each service: **Settings → Deploy Hook** → copy the hook URL.
3. Add GitHub repository secrets:
   - `RENDER_DEPLOY_HOOK_BACKEND` — backend deploy hook URL
   - `RENDER_DEPLOY_HOOK_FRONTEND` — frontend deploy hook URL

#### Android signing (GitHub secrets)

Generate an upload keystore if you don't have one:

```bash
bash frontend/android/scripts/create-keystore.sh
```

Back up `frontend/android/catmap-upload.keystore` and `keystore.properties` securely — losing the upload key makes future Play Store updates difficult unless you use Play App Signing key reset.

Add GitHub repository secrets:

| Secret | Value |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 frontend/android/catmap-upload.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password from `keystore.properties` |
| `ANDROID_KEY_ALIAS` | Key alias (default: `catmap`) |
| `ANDROID_KEY_PASSWORD` | Key password from `keystore.properties` |
| `ANDROID_GOOGLE_SERVICES_JSON` | Full contents of `frontend/android/app/google-services.json` (Firebase; required for FCM) |

### Version numbering

Version is derived from the git tag — do **not** edit `build.gradle` manually for releases.

| Tag | versionName | versionCode |
|-----|-------------|-------------|
| `v1.0.0` | `1.0.0` | `1000000` |
| `v1.0.1` | `1.0.1` | `1000001` |
| `v1.2.3` | `1.2.3` | `1002003` |

Formula: `versionCode = major × 1_000_000 + minor × 1_000 + patch`

---

## Manual local build (optional)

Use this for local testing or if CI is unavailable.

### Prerequisites

1. **JDK 21** — Gradle does not support Java 25. Options:
   - `sudo apt install openjdk-21-jdk` and set `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`
   - Or download Temurin 21 to `/tmp/jdk-21` (see `frontend/scripts/setup-android-env.sh`)
2. **Android SDK** — run `bash frontend/scripts/setup-android-env.sh` or install Android Studio
3. **Node dependencies** — from `frontend/`:
   ```bash
   # If node_modules has permission issues (root-owned files):
   sudo chown -R "$USER:$USER" node_modules
   npm install
   ```

## Build workflow

```bash
cd frontend

# 1. Build web assets for mobile (Render backend, no service worker)
bash scripts/build-mobile.sh
# Or, with a healthy node_modules:
# npm run build:mobile && node node_modules/@capacitor/cli/bin/capacitor sync android

# 2. Generate / refresh icons (after changing resources/icon.png)
npm run cap:assets

# 3. Debug APK (side-load for testing)
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # or /tmp/jdk-21
export ANDROID_HOME=$HOME/Android/Sdk
cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk

# 4. Release AAB (Play Store upload)
cp keystore.properties.example keystore.properties   # fill in real passwords
bash scripts/create-keystore.sh                    # or use your own keystore
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

## Backend / CORS

The mobile app calls `https://catmap-backend.onrender.com` directly with `X-Device-Token` auth.

`https://localhost` (Capacitor WebView origin) is included in `CORS_ORIGINS` in:
- `render.yaml` (production)
- `render-staging.yaml` (staging)

**Redeploy the backend** on Render after merging so the new CORS origin takes effect.

## Testing checklist

- [ ] Map loads OSM tiles and sighting markers
- [ ] "Locate me" prompts for location permission and centers map
- [ ] Add sighting: camera/gallery picker, photo upload, geolocation
- [ ] Sighting detail: confirm, share (uses `https://catmap.drytrix.com/s/{id}`), report
- [ ] Cat profiles, favorites, filters, recent feed, my sightings
- [ ] Android back button closes open sheets/modals, then minimizes app
- [ ] Offline toast appears when connectivity is lost

Install debug APK:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Play Console submission

### App details
| Field | Suggested value |
|-------|-----------------|
| App name | CatMap |
| Package | `com.drytrix.catmap` |
| Category | Maps & Navigation or Entertainment |
| Content rating | Complete questionnaire (no violence; user-generated photos) |

### Required assets
- **App icon**: generated in `android/app/src/main/res/mipmap-*`
- **Feature graphic**: 1024×500 PNG
- **Phone screenshots**: at least 2 (map view, add sighting flow)
- **Privacy policy URL**: `https://catmap.drytrix.com/privacy.html` (or your hosted copy)

### Data safety (Google Play)
Declare collection of:
- **Location** — approximate/precise, for sighting geotagging (not required for app use)
- **Photos** — user-provided cat sighting images
- **Device identifiers** — anonymous `X-Device-Token` (stored locally, not linked to identity)

No account system; no email/phone collection.

### Release steps
1. Create app in [Google Play Console](https://play.google.com/console)
2. Upload `app-release.aab` to **Production** or **Internal testing**
3. Complete store listing, content rating, data safety, and target audience
4. Submit for review (first review typically 1–7 days)

### Version bumps (local builds only)

For CI releases, version comes from the git tag. For manual local builds you can override via Gradle properties:

```bash
./gradlew bundleRelease -PappVersionName=1.0.1 -PappVersionCode=1000001
```

Or edit defaults in `android/app/build.gradle` (not recommended for production releases).

## Push notifications (FCM)

Native Android push uses Firebase Cloud Messaging via `@capacitor/push-notifications`.

### One-time Firebase setup

1. [Firebase Console](https://console.firebase.google.com/) → create/select a project → **Add Android app** with package `com.drytrix.catmap`.
2. Download `google-services.json` → place at `frontend/android/app/google-services.json` (gitignored).
3. Add the same file contents as GitHub secret `ANDROID_GOOGLE_SERVICES_JSON` (repo → Settings → Secrets and variables → Actions). The release workflow writes it into the Android tree before Gradle so CI builds include FCM.
4. Project Settings → **Service accounts** → **Generate new private key**.
5. Paste the JSON as a **single line** into Render → `catmap-backend` → Environment → `FCM_SERVICE_ACCOUNT_JSON`.
6. Tag a release (`git tag vX.Y.Z && git push origin vX.Y.Z`) — or rebuild locally with `npm run cap:sync` then a release build.

Web Push (browser/PWA) uses VAPID instead — generate keys with `python backend/scripts/generate_vapid.py` and set `VAPID_*` on the backend. Test either channel with `POST /api/admin/push/test` (admin token required).

## Optional fast-follow
- **App Links / Universal Links** for `https://catmap.drytrix.com/s/{id}` so shared links open in the app
- See [iOS RELEASE.md](../ios/RELEASE.md) for App Store / TestFlight IPA builds (same tag-triggered workflow)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Unsupported class file major version 69` | Use JDK 21, not Java 25 |
| `semver/functions/satisfies` on `cap sync` | Run `npm install` in a clean `node_modules` |
| CORS errors in WebView | Redeploy backend with `https://localhost` in `CORS_ORIGINS` |
| `No space left on device` during Gradle | Free disk space; Gradle cache + SDK need ~3 GB |
| Share links show `localhost` | Ensure `VITE_PUBLIC_SITE_URL` is set in `.env.mobile` |
