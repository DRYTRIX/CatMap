# 🐱 CatMap

An **anonymous** world map for geotagging cat sightings. Anyone can drop a cat
with a photo + description, and confirm other people's sightings. No accounts,
no logins — just cats.

- **Backend:** Python · FastAPI · SQLAlchemy · Pillow · PostgreSQL
- **Frontend:** React · Vite · Leaflet (OpenStreetMap) · installable PWA
- **Photos** are stored in PostgreSQL; **EXIF GPS** is used automatically when
  present, otherwise you pin the location on a map.
- Runs in Docker and deploys to **Render** via a Blueprint.

---

## How it works

1. Tap **+**, take/choose a cat photo.
2. The app reads the photo's EXIF GPS in the browser. If found, the pin is
   pre-filled; otherwise you drop a pin or tap **My location**.
3. Add a description and post. A dot appears on the world map.
4. Tap any dot to see the photo, description, and **Confirm** the sighting.

Anonymity: each device generates a random token stored in `localStorage`. It's
sent as `X-Device-Token` and used only to prevent double-confirming and to
attribute (not identify) a post. No personal data is collected. Uploaded photos
have their EXIF metadata **stripped** before storage.

---

## Run locally with Docker

```bash
cp .env.example .env       # values are fine as-is for local dev
docker compose up --build
```

- Frontend: <http://localhost:5173>
- Backend API + docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/healthz>

> The frontend image bakes `VITE_API_BASE=http://localhost:8000` at build time
> (see `docker-compose.yml`). If you change the backend port, rebuild the
> frontend image.

## Run the backend without Docker

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# point DATABASE_URL at any Postgres instance
export DATABASE_URL=postgresql+psycopg://catmap:catmap@localhost:5432/catmap
uvicorn app.main:app --reload
```

## Run the frontend dev server

```bash
cd frontend
npm install
npm run fetch-model   # downloads YOLOv10n for client cat pre-check (~9 MB)
# talk to a backend on :8000
echo "VITE_API_BASE=http://localhost:8000" > .env.local
npm run dev
```

---

## API

All endpoints are available under both `/api/v1/...` (canonical, versioned)
and `/api/...` (unversioned alias, kept for backward compatibility). New
clients should prefer `/api/v1`.

| Method | Path                              | Purpose                                   |
| ------ | --------------------------------- | ----------------------------------------- |
| GET    | `/api/v1/sightings?min_lat&max_lat&min_lng&max_lng` | Sightings in a bounding box — `id`, `lat`, `lng`, `description`, `created_at`, `thumbnail_url`, `confirmations_count`, `stale` (supports `since`, `until`, `color`, `is_ear_tipped`, `is_stray`, `min_confidence`, `limit`, `offset`) |
| GET    | `/api/v1/sightings/clusters?min_lat&max_lat&min_lng&max_lng&zoom` | Grid-aggregated counts for zoomed-out views (no cap) |
| GET    | `/api/v1/sightings/recent?limit&offset&sort=recent\|confirmed` | Browse feed of active sightings |
| GET    | `/api/v1/sightings/mine`          | Your device's own sightings (needs token) |
| POST   | `/api/v1/sightings`               | Create (multipart: `images` (1+ files, or legacy `image`), `lat`, `lng`, `description`, `color`, `is_ear_tipped`, `is_stray`, `kind`, `cat_name`, `contact`) |
| GET    | `/api/v1/sightings/{id}/comments` | List tips/comments on a sighting |
| POST   | `/api/v1/sightings/{id}/comments` | Add a comment/tip (optional `lat`/`lng`) |
| GET    | `/api/v1/notifications`           | In-app notification inbox (needs token) |
| POST   | `/api/v1/push/subscribe`          | Register Web Push or FCM token (needs token) |
| GET    | `/api/v1/sightings/{id}`          | Full detail, including a `photos` list    |
| PATCH  | `/api/v1/sightings/{id}`          | Edit your own sighting's description/attributes/location |
| GET    | `/api/v1/sightings/{id}/photo`    | Primary image bytes                       |
| GET    | `/api/v1/sightings/{id}/thumbnail`| Primary thumbnail bytes                   |
| GET    | `/api/v1/sightings/{id}/photos/{photo_id}` | Additional photo bytes           |
| GET    | `/api/v1/sightings/{id}/photos/{photo_id}/thumbnail` | Additional photo thumbnail |
| POST   | `/api/v1/sightings/{id}/confirm`  | Confirm once per device (idempotent; refreshes "last seen") |
| POST   | `/api/v1/sightings/{id}/report`   | Report once per device; auto-hides at threshold |
| POST   | `/api/v1/sightings/{id}/gone`     | Mark your own cat as gone (off the map)   |
| DELETE | `/api/v1/sightings/{id}`          | Delete your own (device must be creator)  |
| GET    | `/healthz`                        | Liveness + DB connectivity                |

`POST`/`PATCH`/`confirm`/`report`/`gone`/`DELETE`/`mine` require the
`X-Device-Token` header. Create, confirm, and report are rate-limited (see
`RATE_LIMIT_*` env vars). A sighting can have up to 6 photos. When
`CAT_DETECTION_STRICT` is enabled, a sighting whose photos don't score above
`CAT_DETECTION_THRESHOLD` (or that couldn't be scored at all) is created with
`status="pending"` instead of being rejected — the response's `pending` field
reflects this — and it stays off the public map until an admin approves it
(see Moderation below). `report` accepts a `reason` of `not_a_cat`, `spam`,
`wrong_location`, `duplicate`, or `other`. Sightings not confirmed within
`STALE_AFTER_DAYS` (default 30) are flagged `stale` and dimmed on the map.

### Moderation (admin)

Set `ADMIN_TOKEN` to enable token-gated moderation (sent as `X-Admin-Token`):

| Method | Path                                      | Purpose                       |
| ------ | ------------------------------------------ | ----------------------------- |
| GET    | `/api/v1/admin/reports?sort&limit&offset`  | List reported sightings, paginated (`sort=reports\|date`) |
| GET    | `/api/v1/admin/pending?limit&offset`       | List sightings queued for review (failed cat detection) |
| POST   | `/api/v1/admin/sightings/{id}/approve`     | Approve a pending sighting (sets `status="active"`) |
| POST   | `/api/v1/admin/sightings/{id}/hide`        | Hide a sighting               |
| POST   | `/api/v1/admin/sightings/{id}/unhide`      | Restore a sighting            |
| DELETE | `/api/v1/admin/sightings/{id}`             | Delete a sighting             |
| GET    | `/api/v1/admin/actions?limit&offset`       | Moderation audit log (newest first) |

Visiting `/admin` on the frontend serves a small token-gated web UI for the
same operations: sign in with the admin token (stored in `sessionStorage`),
then review sightings pending cat-detection approval, view/sort/paginate
reported sightings, hide/unhide/delete them, and review the recent
moderation actions log.

Every hide/unhide/delete is recorded in the `admin_actions` table (action,
sighting ID, timestamp) — this audit trail persists even after a sighting is
deleted.

Sightings reach `status="hidden"` automatically once `AUTO_HIDE_THRESHOLD`
distinct devices report them; hidden sightings vanish from the public map.

### Logging

The backend logs each request as a single-line JSON object (timestamp,
level, method, path, status code, duration, and a per-request
`request_id`) to stdout, via the `catmap` logger. The same `request_id` is
echoed back as the `X-Request-ID` response header (or honored if the client
sends one). Set `LOG_LEVEL` to adjust verbosity (default `INFO`).

### Error tracking (optional)

Set `SENTRY_DSN` (backend) and/or `VITE_SENTRY_DSN` (frontend) to enable
[Sentry](https://sentry.io) error reporting. Both are opt-in — leave empty to
disable. The frontend DSN is read from `window.__CATMAP_ENV__.sentryDsn`
(written to `/env-config.js` at container startup, like
`VITE_GA_MEASUREMENT_ID`) or the build-time `VITE_SENTRY_DSN`, and is skipped
in dev builds. `SENTRY_TRACES_SAMPLE_RATE` and `SENTRY_ENVIRONMENT` tune the
backend's performance-tracing sample rate and reported environment name.

### Database backups

`.github/workflows/backup.yml` runs a nightly Postgres dump via
`backend/scripts/backup_db.sh`, uploaded as a workflow artifact. It's a
no-op until the `BACKUP_DATABASE_URL` repo secret is set — see
[`docs/operations.md`](docs/operations.md) for setup and restore steps.

### Tests

- Backend: `cd backend && pip install -r requirements-dev.txt && pytest` (runs
  against SQLite; covers create/EXIF/confirm/report-auto-hide/delete-ownership/
  rate-limit/upload-hardening).
- Frontend unit/component tests: `cd frontend && npm test` (Vitest + React
  Testing Library; covers `api.js`, `deviceToken.js`, filter/favorite/theme
  helpers, and the `Modal`/`Toast`/`SegmentedControl` components).
- Frontend end-to-end: `cd frontend && npm run e2e` (Playwright; starts the
  dev server itself and runs the add-sighting wizard validation flow, plus
  `@axe-core/playwright` accessibility checks on the map page and the
  add-sighting modal). First run `npx playwright install chromium`.

CI (`.github/workflows/ci.yml`) runs backend lint + tests, frontend unit
tests + build, the Playwright e2e job, and Docker image builds.

---

## Deploy to Render

1. Push this repo to GitHub.
2. Render Dashboard → **New → Blueprint** → pick the repo. Render reads
   `render.yaml` and provisions:
   - `catmap-db` — managed PostgreSQL
   - `catmap-backend` — Docker web service (`DATABASE_URL` auto-wired)
   - `catmap-frontend` — Docker web service (`VITE_API_BASE` baked at build)
3. After the first deploy, confirm the URLs match the values in `render.yaml`
   (`catmap-backend.onrender.com` / `catmap-frontend.onrender.com`). If Render
   assigned different names, update `BACKEND_URL` / `BACKEND_HOST` (frontend) and
   `CORS_ORIGINS` (backend) accordingly and redeploy. The frontend nginx proxies
   `/api` to the backend so the browser stays same-origin; add any custom frontend
   domain to `CORS_ORIGINS` only if you call the backend URL directly.

The backend normalizes Render's `postgresql://` connection string to the
`postgresql+psycopg://` driver form automatically (`app/database.py`).

### Staging environment

`render-staging.yaml` is a second Blueprint that provisions a fully separate
staging stack (`catmap-db-staging`, `catmap-backend-staging`,
`catmap-frontend-staging`) — its own database, services, and URLs, isolated
from production.

1. Render Dashboard → **New → Blueprint** → pick the same repo, but choose
   `render-staging.yaml` as the blueprint file (Render lets you pick a
   non-default blueprint path when creating the Blueprint).
2. As with production, if Render assigns different service names, update
   `BACKEND_URL` / `BACKEND_HOST` / `CORS_ORIGINS` / `PUBLIC_SITE_URL` in
   `render-staging.yaml` and redeploy.
3. Staging defaults to `LOG_LEVEL=DEBUG`, no analytics, and admin/Sentry
   disabled until you set `ADMIN_TOKEN` / `SENTRY_DSN` / `VITE_SENTRY_DSN` in
   the Render dashboard for that service (use a separate Sentry project or
   environment from production).

---

## Mobile / PWA

The frontend is an installable PWA: open it on a phone and **Add to Home
Screen** for a full-screen, app-like experience with camera capture and
geolocation. Because all logic lives in the React app, it can later be wrapped
with [Capacitor](https://capacitorjs.com/) to ship real App Store / Play Store
builds without rewriting features.

---

## Database migrations

Schema changes are managed with **Alembic**. On startup the backend runs
`alembic upgrade head` ([`app/database.py`](backend/app/database.py)).

```bash
cd backend
# apply migrations manually (same as startup)
alembic upgrade head
# create a new revision after editing models
alembic revision -m "describe change" --autogenerate
```

If you deployed **before** Alembic was added and tables already exist, the app
auto-stamps the `0001` baseline on first boot, then applies newer revisions
(e.g. `0002` adds `cat_confidence`). Fresh databases run all revisions from
scratch.

## Cat detection

Uploads are checked server-side with a YOLOv10 COCO object detector (cat class).
Tune via env vars (`CAT_DETECTION_ENABLED`, `CAT_DETECTION_THRESHOLD`,
`CAT_DETECTION_ANIMAL_THRESHOLD`, `CAT_DETECTION_STRICT`). The browser runs a
matching YOLOv10n pre-check; the server is authoritative.

Download models for local dev:

```bash
cd backend && python scripts/fetch_model.py
cd ../frontend && npm run fetch-model
```

## Notes & future work

- For very large datasets, consider marker clustering and/or PostGIS.
