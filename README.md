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
# talk to a backend on :8000
echo "VITE_API_BASE=http://localhost:8000" > .env.local
npm run dev
```

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
upload-hardening). CI (`.github/workflows/ci.yml`) runs lint + tests + builds.

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

---

## Mobile / PWA

The frontend is an installable PWA: open it on a phone and **Add to Home
Screen** for a full-screen, app-like experience with camera capture and
geolocation. Because all logic lives in the React app, it can later be wrapped
with [Capacitor](https://capacitorjs.com/) to ship real App Store / Play Store
builds without rewriting features.

---

## Notes & future work

- Tables are auto-created on startup (`Base.metadata.create_all`). Add Alembic
  if you need migrations.
- `status` field on sightings is a hook for a future moderation/report flow.
- For very large datasets, consider marker clustering and/or PostGIS.
