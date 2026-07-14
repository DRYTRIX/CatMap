# CatMap Android — Play Store Release Guide

## Prerequisites

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

### Version bumps
Edit `android/app/build.gradle`:
```gradle
versionCode 2        // increment every upload
versionName "1.0.1"  // user-visible version
```

## Optional fast-follow
- **App Links** for `https://catmap.drytrix.com/s/{id}` so shared links open in the app
- **iOS build** — same Capacitor project: `npx cap add ios`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Unsupported class file major version 69` | Use JDK 21, not Java 25 |
| `semver/functions/satisfies` on `cap sync` | Run `npm install` in a clean `node_modules` |
| CORS errors in WebView | Redeploy backend with `https://localhost` in `CORS_ORIGINS` |
| `No space left on device` during Gradle | Free disk space; Gradle cache + SDK need ~3 GB |
| Share links show `localhost` | Ensure `VITE_PUBLIC_SITE_URL` is set in `.env.mobile` |
