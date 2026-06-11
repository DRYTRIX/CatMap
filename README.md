# 🐱 CatMap

**Live demo:** [https://catmap.drytrix.com](https://catmap.drytrix.com)

An **anonymous** world map for geotagging cat sightings. Anyone can drop a cat
with a photo + description, and confirm other people's sightings. No accounts,
no logins — just cats.

- **Backend:** Python · FastAPI · SQLAlchemy · Pillow · PostgreSQL
- **Frontend:** React · Vite · Leaflet (OpenStreetMap) · installable PWA
- **Photos** are stored in PostgreSQL; **EXIF GPS** is used automatically when
  present, otherwise you pin the location on a map.
- Runs in Docker and deploys to **Render** via a Blueprint.

> Add a screenshot after deploy: capture the map and save as `docs/screenshot.png`
> for the GitHub README preview.

---

## How it works

1. Tap **Add cat**, take/choose a cat photo.
2. The app reads the photo's EXIF GPS in the browser. If found, the pin is
   pre-filled; otherwise you drop a pin or tap **My location**.
3. Add a description and post. A dot appears on the world map.
4. Tap any dot to see the photo, description, and **Confirm** the sighting.
5. **Share** a sighting — links use `/s/{id}` so social apps show the cat photo.

Anonymity: each device generates a random token stored in `localStorage`. It's
sent as `X-Device-Token` and used only to prevent double-confirming and to
attribute (not identify) a post. No personal data is collected. Uploaded photos
have their EXIF metadata **stripped** before storage. See
[Privacy Policy](https://catmap.drytrix.com/privacy.html).

---

## Run locally with Docker

```bash
cp .env.example .env       # values are fine as-is for local dev
docker compose up --build
```

- Frontend: <http://localhost:5173>
- Backend API + docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/healthz>

> The frontend uses same-origin `/api` (nginx proxies to the backend). No
> `VITE_API_BASE` is needed for local Docker.

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
npm run dev
```

The Vite dev server proxies `/api` and `/s` to the backend on `:8000`.

---

## API

| Method | Path                              | Purpose                                   |
| ------ | --------------------------------- | ----------------------------------------- |
| GET    | `/api/sightings?min_lat&max_lat&min_lng&max_lng` | Dots in a bounding box        |
| POST   | `/api/sightings`                  | Create (multipart: image, lat, lng, description) |
| GET    | `/api/sightings/{id}`             | Full detail                               |
| GET    | `/api/sightings/{id}/photo`       | Full image bytes                          |
| GET    | `/api/sightings/{id}/thumbnail`   | Thumbnail bytes                           |
| POST   | `/api/sightings/{id}/confirm`     | Confirm once per device (idempotent)      |
| POST   | `/api/sightings/{id}/report`      | Report once per device; auto-hides at threshold |
| DELETE | `/api/sightings/{id}`             | Delete your own (device must be creator)  |
| GET    | `/api/stats`                      | Public aggregate counts (`total_cats`)    |
| GET    | `/s/{id}`                         | Share page with Open Graph tags (HTML)    |
| GET    | `/healthz`                        | Liveness + DB connectivity                |

`POST`/`confirm`/`report`/`DELETE` require the `X-Device-Token` header. Create,
confirm, and report are rate-limited (see `RATE_LIMIT_*` env vars).

### Moderation (admin)

Set `ADMIN_TOKEN` to enable token-gated moderation (sent as `X-Admin-Token`):

| Method | Path                                   | Purpose                       |
| ------ | -------------------------------------- | ----------------------------- |
| GET    | `/api/admin/reports`                   | List reported sightings       |
| POST   | `/api/admin/sightings/{id}/hide`       | Hide a sighting               |
| POST   | `/api/admin/sightings/{id}/unhide`     | Restore a sighting            |
| DELETE | `/api/admin/sightings/{id}`            | Delete a sighting             |

Sightings reach `status="hidden"` automatically once `AUTO_HIDE_THRESHOLD`
distinct devices report them; hidden sightings vanish from the public map.

### Tests

`cd backend && pip install -r requirements-dev.txt && pytest` (runs against
SQLite; covers create/EXIF/confirm/report-auto-hide/delete-ownership/rate-limit/
share pages/stats/upload-hardening). CI (`.github/workflows/ci.yml`) runs lint +
tests + builds.

---

## Deploy to Render

1. Push this repo to GitHub.
2. Render Dashboard → **New → Blueprint** → pick the repo. Render reads
   `render.yaml` and provisions:
   - `catmap-db` — managed PostgreSQL
   - `catmap-backend` — Docker web service (`DATABASE_URL` auto-wired)
   - `catmap-frontend` — Docker web service (`VITE_API_BASE` empty; nginx proxies `/api`)
3. Confirm `BACKEND_URL` / `BACKEND_HOST` in `render.yaml` match your Render
   service names if they differ from the defaults.

The backend normalizes Render's `postgresql://` connection string to the
`postgresql+psycopg://` driver form automatically (`app/database.py`).

### Custom domain (`catmap.drytrix.com`)

1. Render → `catmap-frontend` → **Settings → Custom Domains** → add
   `catmap.drytrix.com`.
2. DNS: add a **CNAME** record `catmap` → your Render hostname (shown in the
   dashboard).
3. Wait for TLS certificate provisioning (usually a few minutes).
4. `render.yaml` already sets `CORS_ORIGINS` and `PUBLIC_SITE_URL` for this
   domain. Redeploy if you change them.

### Launch checklist

After the first deploy, complete these in the Render dashboard:

| Task | Service | Variable / action |
| ---- | ------- | ----------------- |
| Analytics | `catmap-frontend` | Set `VITE_GA_MEASUREMENT_ID` to your `G-XXXXXXXXXX`, then redeploy |
| Moderation | `catmap-backend` | Set `ADMIN_TOKEN` to a strong secret |
| Custom domain | `catmap-frontend` | Add `catmap.drytrix.com` + DNS CNAME |
| GitHub repo | GitHub settings | Homepage → `https://catmap.drytrix.com`, topics: `cats`, `map`, `pwa`, `fastapi`, `react` |

Verify share previews: paste `https://catmap.drytrix.com/s/{sighting-id}` into
[Discord](https://discord.com) or the [Twitter Card Validator](https://cards-dev.twitter.com/validator).

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

Uploads are checked server-side with a YOLOv8n ONNX detector (multi-crop scan for
small cats in busy scenes). Tune via
env vars (`CAT_DETECTION_ENABLED`, `CAT_DETECTION_THRESHOLD`, `CAT_DETECTION_STRICT`).
The browser shows an optional pre-check hint (TensorFlow.js loaded on demand);
the server is authoritative.

Download the model for local backend dev:

```bash
cd backend && python scripts/fetch_model.py
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
Security reports: [SECURITY.md](SECURITY.md). Code of conduct:
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Notes & future work

- For very large datasets, consider PostGIS for spatial queries (marker clustering is already enabled).
- Capacitor wrapper for native app store distribution.
