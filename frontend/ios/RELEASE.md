# iOS release (prep)

CatMap's iOS platform folder is checked in for building on macOS with Xcode. This machine cannot sign or run iOS builds.

## Prerequisites

- macOS with Xcode installed
- Apple Developer account
- Node.js + npm (same versions as the frontend README)

## Setup

```bash
cd frontend
npm install
npm run cap:sync   # or: npm run build:mobile && npx cap sync ios
npx cap open ios
```

## Push notifications (optional)

1. Create an Apple Push Notification key in the Apple Developer portal.
2. Upload the APNs key to your Firebase project (if using FCM as a bridge) or configure native APNs in Capacitor.
3. Enable Push Notifications capability in Xcode for the app target.

## Build & archive

1. Open the workspace in Xcode (`ios/App/App.xcworkspace`).
2. Select your team under Signing & Capabilities.
3. Product → Archive → Distribute to TestFlight or App Store.

## Notes

- The WebView loads the same React bundle as Android (`npm run build:mobile`).
- Status bar styling mirrors Android via Capacitor plugins in `src/lib/nativeInit.js`.
