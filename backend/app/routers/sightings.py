from datetime import UTC, datetime, timedelta

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..cat_detection import detect_cat, get_detection_status
from ..config import get_settings
from ..database import get_db
from ..deps import device_token
from ..images import InvalidImageError, extract_gps, process_upload
from ..models import Confirmation, Photo, Report, Sighting
from ..ratelimit import limiter
from ..schemas import (
    ConfirmResult,
    CreateSightingResult,
    PhotoOut,
    ReportResult,
    SightingCluster,
    SightingDetail,
    SightingDot,
)

router = APIRouter(prefix="/sightings", tags=["sightings"])
settings = get_settings()

MAX_DESCRIPTION = 1000
MAX_COLOR = 30
MAX_PHOTOS_PER_SIGHTING = 6

# Reasons accepted by the report endpoint (empty string = unspecified).
ALLOWED_REPORT_REASONS = {"not_a_cat", "spam", "wrong_location", "duplicate", "other"}


def no_cache(response: Response) -> None:
    """Mark a dynamic response uncacheable so deletes/edits propagate promptly."""
    response.headers["Cache-Control"] = "no-cache"


def _photo_url(sighting_id: str) -> str:
    return f"/api/sightings/{sighting_id}/photo"


def _thumb_url(sighting_id: str) -> str:
    return f"/api/sightings/{sighting_id}/thumbnail"


def _photos(s: Sighting) -> list[PhotoOut]:
    items = [
        PhotoOut(
            id="primary",
            position=0,
            photo_url=_photo_url(s.id),
            thumbnail_url=_thumb_url(s.id),
        )
    ]
    for p in s.photos:
        items.append(
            PhotoOut(
                id=p.id,
                position=p.position,
                photo_url=f"/api/sightings/{s.id}/photos/{p.id}",
                thumbnail_url=f"/api/sightings/{s.id}/photos/{p.id}/thumbnail",
            )
        )
    return items


def _last_seen(s: Sighting) -> datetime:
    """Effective last-seen time (falls back to creation for pre-migration rows)."""
    return s.last_seen_at or s.created_at


def _is_stale(last_seen: datetime) -> bool:
    """True when a sighting hasn't been confirmed within the staleness window."""
    if settings.stale_after_days <= 0:
        return False
    # created_at/last_seen_at may be naive when read back from SQLite in tests.
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)
    return last_seen < datetime.now(UTC) - timedelta(days=settings.stale_after_days)


def _detail(s: Sighting) -> dict:
    last_seen = _last_seen(s)
    return {
        "id": s.id,
        "lat": s.lat,
        "lng": s.lng,
        "description": s.description,
        "confirmations_count": s.confirmations_count,
        "created_at": s.created_at,
        "last_seen_at": last_seen,
        "stale": _is_stale(last_seen),
        "photo_url": _photo_url(s.id),
        "thumbnail_url": _thumb_url(s.id),
        "photos": _photos(s),
        "color": s.color,
        "is_ear_tipped": s.is_ear_tipped,
        "is_stray": s.is_stray,
    }


def _bbox_filter_conditions(
    min_lat: float,
    max_lat: float,
    min_lng: float,
    max_lng: float,
    since: datetime | None,
    until: datetime | None,
    color: str | None,
    is_ear_tipped: bool | None,
    is_stray: bool | None,
    min_confidence: float | None,
) -> list:
    """Build the active-status + bounding-box + discovery-filter WHERE clauses.

    Shared by ``list_sightings`` and ``cluster_sightings`` so the map applies the
    same filters whether it's showing exact dots (zoomed in) or grid clusters
    (zoomed out).
    """
    conditions = [
        Sighting.status == "active",
        Sighting.lat >= min_lat,
        Sighting.lat <= max_lat,
        Sighting.lng >= min_lng,
        Sighting.lng <= max_lng,
    ]
    if since is not None:
        conditions.append(Sighting.created_at >= since)
    if until is not None:
        conditions.append(Sighting.created_at <= until)
    if color is not None:
        conditions.append(Sighting.color == color)
    if is_ear_tipped is not None:
        conditions.append(Sighting.is_ear_tipped == is_ear_tipped)
    if is_stray is not None:
        conditions.append(Sighting.is_stray == is_stray)
    if min_confidence is not None:
        conditions.append(Sighting.cat_confidence >= min_confidence)
    return conditions


@router.get("", response_model=list[SightingDot])
def list_sightings(
    min_lat: float,
    max_lat: float,
    min_lng: float,
    max_lng: float,
    since: datetime | None = None,
    until: datetime | None = None,
    color: str | None = None,
    is_ear_tipped: bool | None = None,
    is_stray: bool | None = None,
    min_confidence: float | None = None,
    limit: int | None = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> list[SightingDot]:
    """Return lightweight dots within the given bounding box."""
    if min_lat > max_lat or min_lng > max_lng:
        raise HTTPException(status_code=400, detail="Invalid bounding box.")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0.")

    effective_limit = settings.max_dots_per_query
    if limit is not None:
        if limit < 1:
            raise HTTPException(status_code=400, detail="limit must be >= 1.")
        effective_limit = min(limit, settings.max_dots_per_query)

    conditions = _bbox_filter_conditions(
        min_lat, max_lat, min_lng, max_lng,
        since, until, color, is_ear_tipped, is_stray, min_confidence,
    )

    stmt = (
        select(
            Sighting.id,
            Sighting.lat,
            Sighting.lng,
            Sighting.confirmations_count,
            Sighting.description,
            Sighting.created_at,
            Sighting.last_seen_at,
        )
        .where(*conditions)
        .order_by(Sighting.created_at.desc())
        .limit(effective_limit)
        .offset(offset)
    )
    rows = db.execute(stmt).all()
    return [
        SightingDot(
            id=r.id,
            lat=r.lat,
            lng=r.lng,
            confirmations_count=r.confirmations_count,
            description=r.description,
            created_at=r.created_at,
            thumbnail_url=_thumb_url(r.id),
            stale=_is_stale(r.last_seen_at or r.created_at),
        )
        for r in rows
    ]


@router.get("/clusters", response_model=list[SightingCluster])
def cluster_sightings(
    min_lat: float,
    max_lat: float,
    min_lng: float,
    max_lng: float,
    zoom: int = Query(..., ge=0, le=22),
    since: datetime | None = None,
    until: datetime | None = None,
    color: str | None = None,
    is_ear_tipped: bool | None = None,
    is_stray: bool | None = None,
    min_confidence: float | None = None,
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> list[SightingCluster]:
    """Aggregate active sightings into a grid so zoomed-out views never drop dots.

    Unlike ``list_sightings`` (which caps at ``max_dots_per_query``), this counts
    *every* sighting in the box by binning to a zoom-dependent grid. ``round`` is
    used for the grid key because it exists on both SQLite and PostgreSQL. Honors
    the same discovery filters as ``list_sightings`` so filtering works at every
    zoom level.
    """
    if min_lat > max_lat or min_lng > max_lng:
        raise HTTPException(status_code=400, detail="Invalid bounding box.")

    cell = settings.cluster_base_degrees / (2**zoom)
    lat_key = func.round(Sighting.lat / cell)
    lng_key = func.round(Sighting.lng / cell)

    conditions = _bbox_filter_conditions(
        min_lat, max_lat, min_lng, max_lng,
        since, until, color, is_ear_tipped, is_stray, min_confidence,
    )

    stmt = (
        select(lat_key.label("lat_key"), lng_key.label("lng_key"), func.count().label("n"))
        .where(*conditions)
        .group_by("lat_key", "lng_key")
    )
    rows = db.execute(stmt).all()
    # Cell centre = key * cell. Counts are exact — nothing is silently dropped.
    return [
        SightingCluster(lat=r.lat_key * cell, lng=r.lng_key * cell, count=r.n)
        for r in rows
    ]


def _normalize_color(color: str | None) -> str | None:
    if color is None:
        return None
    color = color.strip()[:MAX_COLOR]
    return color or None


@router.post("", response_model=CreateSightingResult, status_code=201)
@limiter.limit(settings.rate_limit_create)
async def create_sighting(
    request: Request,
    image: UploadFile | None = File(None),
    images: list[UploadFile] = File(default=[]),
    description: str = Form(""),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    color: str | None = Form(None),
    is_ear_tipped: bool | None = Form(None),
    is_stray: bool | None = Form(None),
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Create a sighting (one or more photos). Coordinates come from the form,
    or EXIF as a fallback (taken from the first photo that has GPS data)."""
    files = [f for f in images if f is not None and f.filename] or (
        [image] if image is not None else []
    )
    if not files:
        raise HTTPException(status_code=400, detail="No image provided.")
    if len(files) > MAX_PHOTOS_PER_SIGHTING:
        raise HTTPException(
            status_code=400,
            detail=f"Too many photos (max {MAX_PHOTOS_PER_SIGHTING}).",
        )

    raw_list: list[bytes] = []
    for f in files:
        raw = await f.read()
        if len(raw) == 0:
            raise HTTPException(status_code=400, detail="Empty upload.")
        if len(raw) > settings.max_upload_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Image exceeds {settings.max_upload_mb} MB limit.",
            )
        raw_list.append(raw)

    # Prefer client-supplied coordinates; fall back to EXIF GPS from any photo.
    if lat is None or lng is None:
        gps = None
        for raw in raw_list:
            gps = extract_gps(raw)
            if gps is not None:
                break
        if gps is None:
            raise HTTPException(
                status_code=400,
                detail="No location provided and none found in the photo.",
            )
        lat, lng = gps

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Coordinates out of range.")

    processed: list[tuple[bytes, bytes, str]] = []
    for raw in raw_list:
        try:
            processed.append(
                process_upload(
                    raw,
                    settings.image_max_edge,
                    settings.thumbnail_max_edge,
                    settings.max_image_pixels,
                )
            )
        except InvalidImageError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if (
        settings.cat_detection_enabled
        and settings.cat_detection_strict
        and get_detection_status() == "unavailable"
    ):
        raise HTTPException(
            status_code=503,
            detail="Cat detection is temporarily unavailable. Please try again later.",
        )

    scores = [detect_cat(main_bytes) for main_bytes, _, _ in processed]
    valid_scores = [s for s in scores if s is not None]
    best_score = max(valid_scores) if valid_scores else None
    if settings.cat_detection_enabled and best_score is not None:
        if settings.cat_detection_strict and best_score < settings.cat_detection_threshold:
            raise HTTPException(
                status_code=400,
                detail="We couldn't spot a cat in this photo. Try a clearer, closer shot.",
            )

    primary_main, primary_thumb, primary_mime = processed[0]
    sighting = Sighting(
        lat=lat,
        lng=lng,
        description=(description or "").strip()[:MAX_DESCRIPTION],
        photo=primary_main,
        thumbnail=primary_thumb,
        photo_mime=primary_mime,
        creator_token=token,
        cat_confidence=best_score,
        color=_normalize_color(color),
        is_ear_tipped=is_ear_tipped,
        is_stray=is_stray,
    )
    for position, (main_bytes, thumb_bytes, mime) in enumerate(processed[1:], start=1):
        sighting.photos.append(
            Photo(photo=main_bytes, thumbnail=thumb_bytes, photo_mime=mime, position=position)
        )

    db.add(sighting)
    db.commit()
    db.refresh(sighting)
    return _detail(sighting)


# NOTE: these literal paths must precede "/{sighting_id}" so the path param
# doesn't capture "recent" / "mine".
@router.get("/recent", response_model=list[SightingDetail])
def recent_sightings(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    sort: str = Query("recent", pattern="^(recent|confirmed)$"),
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> list[dict]:
    """Browse active sightings as a feed — newest first, or most-confirmed."""
    order = (
        (Sighting.confirmations_count.desc(), Sighting.created_at.desc())
        if sort == "confirmed"
        else (Sighting.created_at.desc(),)
    )
    stmt = (
        select(Sighting)
        .where(Sighting.status == "active")
        .order_by(*order)
        .offset(offset)
        .limit(limit)
    )
    return [_detail(s) for s in db.execute(stmt).scalars().all()]


@router.get("/mine", response_model=list[SightingDetail])
def my_sightings(
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Active sightings created by the calling device, newest first."""
    stmt = (
        select(Sighting)
        .where(Sighting.creator_token == token, Sighting.status == "active")
        .order_by(Sighting.created_at.desc())
        .limit(200)
    )
    return [_detail(s) for s in db.execute(stmt).scalars().all()]


@router.get("/{sighting_id}", response_model=SightingDetail)
def get_sighting(
    sighting_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> dict:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None or sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")
    return _detail(sighting)


@router.get("/{sighting_id}/photo")
def get_photo(sighting_id: str, db: Session = Depends(get_db)) -> Response:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None or sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")
    return Response(
        content=sighting.photo,
        media_type=sighting.photo_mime,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/{sighting_id}/thumbnail")
def get_thumbnail(sighting_id: str, db: Session = Depends(get_db)) -> Response:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None or sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")
    return Response(
        content=sighting.thumbnail,
        media_type=sighting.photo_mime,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


def _get_extra_photo(db: Session, sighting_id: str, photo_id: str) -> Photo:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None or sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")
    photo = db.get(Photo, photo_id)
    if photo is None or photo.sighting_id != sighting_id:
        raise HTTPException(status_code=404, detail="Photo not found.")
    return photo


@router.get("/{sighting_id}/photos/{photo_id}")
def get_extra_photo(sighting_id: str, photo_id: str, db: Session = Depends(get_db)) -> Response:
    photo = _get_extra_photo(db, sighting_id, photo_id)
    return Response(
        content=photo.photo,
        media_type=photo.photo_mime,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/{sighting_id}/photos/{photo_id}/thumbnail")
def get_extra_thumbnail(
    sighting_id: str, photo_id: str, db: Session = Depends(get_db)
) -> Response:
    photo = _get_extra_photo(db, sighting_id, photo_id)
    return Response(
        content=photo.thumbnail,
        media_type=photo.photo_mime,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.post("/{sighting_id}/confirm", response_model=ConfirmResult)
@limiter.limit(settings.rate_limit_confirm)
def confirm_sighting(
    request: Request,
    sighting_id: str,
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> ConfirmResult:
    """Confirm a sighting once per device (idempotent)."""
    sighting = db.get(Sighting, sighting_id)
    if sighting is None or sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")

    confirmation = Confirmation(sighting_id=sighting_id, device_token=token)
    db.add(confirmation)
    try:
        # Flush to trigger the unique constraint before mutating the counter.
        db.flush()
    except IntegrityError:
        db.rollback()
        # Already confirmed by this device — return the current count unchanged.
        current = db.get(Sighting, sighting_id)
        return ConfirmResult(
            confirmations=current.confirmations_count, already_confirmed=True
        )

    sighting.confirmations_count += 1
    sighting.last_seen_at = datetime.now(UTC)  # a fresh confirmation = recently seen
    db.commit()
    return ConfirmResult(
        confirmations=sighting.confirmations_count, already_confirmed=False
    )


@router.post("/{sighting_id}/report", response_model=ReportResult)
@limiter.limit(settings.rate_limit_report)
def report_sighting(
    request: Request,
    sighting_id: str,
    reason: str = Form(""),
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> ReportResult:
    """Report a sighting once per device; auto-hide once enough reports accrue."""
    sighting = db.get(Sighting, sighting_id)
    if sighting is None or sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")

    reason = (reason or "").strip()
    if reason and reason not in ALLOWED_REPORT_REASONS:
        raise HTTPException(status_code=400, detail="Invalid report reason.")

    report = Report(
        sighting_id=sighting_id,
        device_token=token,
        reason=reason[:280],
    )
    db.add(report)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return ReportResult(reported=False, hidden=sighting.status == "hidden")

    sighting.reports_count += 1
    if sighting.reports_count >= settings.auto_hide_threshold:
        sighting.status = "hidden"
    db.commit()
    return ReportResult(reported=True, hidden=sighting.status == "hidden")


def _get_own_sighting(db: Session, sighting_id: str, token: str) -> Sighting:
    """Fetch a sighting the calling device created, or raise 404/403."""
    sighting = db.get(Sighting, sighting_id)
    if sighting is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    if sighting.creator_token != token:
        raise HTTPException(status_code=403, detail="Not your sighting.")
    return sighting


@router.patch("/{sighting_id}", response_model=SightingDetail)
def update_sighting(
    sighting_id: str,
    description: str | None = Form(None),
    color: str | None = Form(None),
    is_ear_tipped: bool | None = Form(None),
    is_stray: bool | None = Form(None),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Edit a sighting's description/attributes/location — creator-only."""
    sighting = _get_own_sighting(db, sighting_id, token)
    if sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")

    if description is not None:
        sighting.description = description.strip()[:MAX_DESCRIPTION]
    if color is not None:
        sighting.color = _normalize_color(color)
    if is_ear_tipped is not None:
        sighting.is_ear_tipped = is_ear_tipped
    if is_stray is not None:
        sighting.is_stray = is_stray
    if lat is not None or lng is not None:
        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail="Provide both lat and lng.")
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise HTTPException(status_code=400, detail="Coordinates out of range.")
        sighting.lat = lat
        sighting.lng = lng

    db.commit()
    db.refresh(sighting)
    return _detail(sighting)


@router.post("/{sighting_id}/gone", response_model=SightingDetail)
def mark_gone(
    sighting_id: str,
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Mark your own sighting as 'gone' — the cat has moved on (off the map)."""
    sighting = _get_own_sighting(db, sighting_id, token)
    sighting.status = "gone"
    db.commit()
    db.refresh(sighting)
    return _detail(sighting)


@router.delete("/{sighting_id}", status_code=204)
def delete_sighting(
    sighting_id: str,
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a sighting — only the device that created it may do so."""
    sighting = _get_own_sighting(db, sighting_id, token)
    db.delete(sighting)  # cascades to confirmations and reports
    db.commit()
    return Response(status_code=204)
