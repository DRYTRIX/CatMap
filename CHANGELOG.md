# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Missing-cat posts: optional `cat_name` and `contact` fields; mark-as-found flow.
- Comment/tip threads on sightings (with optional location for missing cats).
- User notification inbox plus Web Push (VAPID) and Android FCM delivery.
- Nearby missing-cat alerts (opt-in radius around a location).
- Individual extra-photo deletion (creator/contributor + admin).
- Recent feed filters: kind tabs, text search, near-me, reunited (`found`) posts.
- Device-token blocklist for moderation (`/api/admin/blocked-tokens`).
- Device identity export/import (QR + JSON) in Settings.
- Offline sighting queue (IndexedDB) with auto-flush on reconnect.
- iOS Capacitor platform + CI IPA builds (`frontend/ios/`, release workflow).
- `PUBLIC_SITE_URL` setting wired into backend config (fixes a crash on the
  `/s/{id}` share page).
- Dependabot configuration for pip, npm, Docker base images, and GitHub
  Actions.
- `pip-audit` and `npm audit` checks in CI (non-blocking).
- Multi-photo sightings (up to 6 photos per sighting), with new endpoints to
  fetch additional photos/thumbnails.
- Optional sighting attributes: `color`, `is_ear_tipped`, `is_stray`.
- `/api/sightings` discovery query gains `since`, `until`, `color`,
  `is_ear_tipped`, `is_stray`, `min_confidence`, `limit`, and `offset`
  filters; `/api/admin/reports` gains pagination and sorting.
- `PATCH /api/sightings/{id}` lets a sighting's creator edit its description
  and attributes.
- Versioned API mounted at `/api/v1` (canonical), alongside the existing
  `/api` alias.
- Frontend: a map filter panel (date range, color, ear-tipped/stray status,
  min. cat-detection confidence), persisted to `localStorage`.
- `/api/sightings` list response now includes `description`, `created_at`,
  and `thumbnail_url` for each sighting.
- Frontend: a list/feed view toggle showing nearby sightings as a scrollable
  list alongside the map.
- Frontend: the "add sighting" wizard now supports capturing/selecting up to
  6 photos per sighting, and the detail sheet shows a thumbnail strip and a
  swipeable, keyboard-navigable lightbox gallery.
- Frontend: an "Edit" action for your own sightings, letting you update the
  description, color/pattern, ear-tipped, and stray status.
- Frontend: the share button now attaches the sighting's photo to the native
  share sheet when supported, falling back to link-only sharing, then
  clipboard copy.
- Frontend: a "Save" action on each sighting and a Favorites list, stored in
  `localStorage`.
- Frontend: a dark mode toggle in the header (persisted to `localStorage`,
  defaults to the OS preference), including a dark map tile filter.
- Frontend: a lightweight `/admin` UI (token-gated via `X-Admin-Token`,
  stored in `sessionStorage`) for reviewing reported sightings — sort,
  paginate, and hide/unhide/delete.
- Optional error tracking via Sentry: backend (`sentry-sdk`, gated by
  `SENTRY_DSN`) and frontend (`@sentry/react`, gated by `VITE_SENTRY_DSN` /
  runtime `env-config.js`), both disabled unless a DSN is configured.
- Backend: structured JSON request logging (method, path, status, duration,
  `request_id`), with the request ID echoed back as `X-Request-ID`.
  `LOG_LEVEL` controls verbosity.
- Moderation audit log: hide/unhide/delete actions are recorded in a new
  `admin_actions` table, exposed via `GET /api/admin/actions` and shown in
  the `/admin` UI.
- Nightly database backup workflow (`.github/workflows/backup.yml`) and
  `backend/scripts/backup_db.sh`, with setup/restore docs in
  `docs/operations.md`. Inert until the `BACKUP_DATABASE_URL` secret is set.
- `render-staging.yaml`: a separate Render Blueprint provisioning an
  isolated staging stack (own database, backend, and frontend services).
- Frontend unit/component tests (Vitest + React Testing Library) covering
  `api.js`, `deviceToken.js`, the filters/favorites/theme helpers, and the
  `Modal`/`Toast`/`SegmentedControl` components. Run with `npm test`.
- A Playwright end-to-end test (`npm run e2e`) covering the add-sighting
  wizard's photo-requirement validation, run as a new `e2e` job in CI.
- Accessibility checks (`@axe-core/playwright`) for the map page and the
  add-sighting modal, run as part of the `e2e` CI job.
- Backend: tests for EXIF GPS extraction edge cases (missing/invalid GPS,
  out-of-range coordinates, hemisphere signs, EXIF orientation handling),
  the rate limiter's device-token/IP key fallback, and the `min_confidence`
  discovery filter.

### Fixed
- Vite dev-server proxy rule for `/s/{id}` share links no longer shadows
  every `/src/*` module request (was breaking `npm run dev`).

## [0.2.0] - 2026-06-11
### Fixed
- Server-side upload cropping and cat detection improvements.
- Cat detection accuracy improvements.

## [0.1.0] - 2026-06-09
### Added
- Production readiness pass (Docker, Render deployment, Alembic migrations).
- Server-side cat-in-picture detection (ONNX COCO SSD).
- Google Analytics (GA4) support with consent banner.
- GitHub and website links in the footer.

### Fixed
- Vite dependency and CORS issues for the deployed site.

## [0.0.1] - 2026-06-08
### Added
- Initial release: anonymous world map for geotagging cat sightings, with
  EXIF GPS pin placement, confirmations, reports, and moderation.
