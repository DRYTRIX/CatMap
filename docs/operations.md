# Operations

## Database backups

`.github/workflows/backup.yml` runs nightly (03:00 UTC) and on-demand
(`workflow_dispatch`). It dumps the Postgres database with
`backend/scripts/backup_db.sh` and uploads the gzipped `.sql.gz` file as a
workflow artifact (30-day retention).

### Setup

1. In Render, open `catmap-db` → **Connect** and copy the **External
   Connection String** (the internal one isn't reachable from GitHub
   Actions).
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions**
   and add a secret named `BACKUP_DATABASE_URL` with that connection string.
3. (Optional) For longer-than-30-day retention, also copy backups to an
   S3-compatible bucket by adding these secrets:
   - `BACKUP_S3_BUCKET` — bucket name
   - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
   - `AWS_DEFAULT_REGION` (and `AWS_ENDPOINT_URL` for non-AWS providers like
     Backblaze B2, Cloudflare R2, etc.)

If `BACKUP_DATABASE_URL` isn't set, the workflow runs but skips the backup
step (visible as a warning in the run log) — it won't fail CI or alert
anyone.

### Restoring a backup

Download the artifact (or S3 object), then:

```bash
gunzip -c catmap-20260101T030000Z.sql.gz | psql "$DATABASE_URL"
```

Use a connection string for the target database (a fresh Render Postgres
instance, or a local Postgres for testing). Restoring into a database that
already has data will likely produce conflicts — restore into an empty
database, or drop and recreate it first.

After restoring, run `alembic upgrade head` (or let the app's startup
migration runner do it) if the backup predates the running app's migrations.

## Manual backup

You can also run the backup script directly against any database:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/catmap ./backend/scripts/backup_db.sh ./backups
```

Requires `pg_dump` (the `postgresql-client` package).

## Push notifications

CatMap supports three notification channels:

1. **In-app inbox** — always available; polled via `/api/notifications`.
2. **Web Push (VAPID)** — browser PWA; requires VAPID keys on the backend.
3. **FCM (Android)** — native app via Capacitor; requires Firebase.

### Web Push (VAPID)

Generate a keypair:

```bash
npx web-push generate-vapid-keys
```

Set on the backend (Render → `catmap-backend` → Environment):

- `VAPID_PUBLIC_KEY` — the public key
- `VAPID_PRIVATE_KEY` — the private key
- `VAPID_SUBJECT` — e.g. `mailto:you@example.com`

The frontend service worker registers push subscriptions against
`/api/push/subscribe`.

### FCM (Android)

1. Create a Firebase project and add an Android app (`com.catmap.app` or your
   application id).
2. Download `google-services.json` into `frontend/android/app/`.
3. Create a Firebase service account with **Firebase Cloud Messaging API
   Admin** and paste the JSON into `FCM_SERVICE_ACCOUNT_JSON` on the backend
   (single-line JSON string).

Without Firebase configured, the app still works — inbox notifications remain;
native push is skipped gracefully.

### Nearby missing-cat alerts

Users opt in via **Settings → Alert me about missing cats nearby**. The
backend stores `alert_lat`, `alert_lng`, and `alert_radius_km` on each push
subscription and notifies matching devices when a new `kind=missing` post is
created.

## Accounts, email, and Google sign-in

Accounts are **optional**. Anonymous device-token usage continues to work.
Signing in links the current device token to the account so ownership,
hearts, and inbox sync across devices.

### Resend (email)

1. Create a [Resend](https://resend.com) account and API key.
2. Verify your sending domain (or use Resend's onboarding domain for tests).
3. Set on the backend:
   - `RESEND_API_KEY`
   - `EMAIL_FROM` — e.g. `CatMap <noreply@yourdomain.com>`
   - optional `EMAIL_REPLY_TO`
4. With the key unset, verification / reset / notification emails are no-ops
   (useful for local Docker).

### Google OAuth

1. In Google Cloud Console, create OAuth client IDs for **Web**, **Android**,
   and **iOS** (same project as Firebase if you already use FCM).
2. Set `GOOGLE_CLIENT_IDS` on the backend to the comma-separated list of all
   client IDs.
3. Set `VITE_GOOGLE_CLIENT_ID` on the frontend to the **web** client ID.
4. Android: add the signing SHA-1 fingerprint to the Android OAuth client and
   keep `google-services.json` in place.
5. iOS: add the reversed client ID URL scheme to the iOS app / Info.plist.
6. Native apps use `@capacitor-firebase/authentication` when installed
   (`npm i @capacitor-firebase/authentication` then `npx cap sync`). The
   plugin returns a Google ID token that is posted to `/api/auth/google`.
   Email/password remains available so App Store guideline 4.8 is satisfied
   without Sign in with Apple.
