from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from sqlalchemy import select
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
    SightingDetail,
    SightingDot,
)

router = APIRouter(prefix="/sightings", tags=["sightings"])
settings = get_settings()

MAX_DESCRIPTION = 1000
MAX_COLOR = 30
MAX_PHOTOS_PER_SIGHTING = 6


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


def _detail(s: Sighting) -> dict:
    return {
        "id": s.id,
        "lat": s.lat,
        "lng": s.lng,
        "description": s.description,
        "confirmations_count": s.confirmations_count,
        "created_at": s.created_at,
        "photo_url": _photo_url(s.id),
        "thumbnail_url": _thumb_url(s.id),
        "photos": _photos(s),
        "color": s.color,
        "is_ear_tipped": s.is_ear_tipped,
        "is_stray": s.is_stray,
    }


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

    stmt = (
        select(
            Sighting.id,
            Sighting.lat,
            Sighting.lng,
            Sighting.confirmations_count,
            Sighting.description,
            Sighting.created_at,
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
        )
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


@router.get("/{sighting_id}", response_model=SightingDetail)
def get_sighting(sighting_id: str, db: Session = Depends(get_db)) -> dict:
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

    report = Report(
        sighting_id=sighting_id,
        device_token=token,
        reason=(reason or "").strip()[:280],
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


@router.patch("/{sighting_id}", response_model=SightingDetail)
def update_sighting(
    sighting_id: str,
    description: str | None = Form(None),
    color: str | None = Form(None),
    is_ear_tipped: bool | None = Form(None),
    is_stray: bool | None = Form(None),
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Edit a sighting's description/attributes — creator-only."""
    sighting = db.get(Sighting, sighting_id)
    if sighting is None or sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")
    if sighting.creator_token != token:
        raise HTTPException(status_code=403, detail="Not your sighting.")

    if description is not None:
        sighting.description = description.strip()[:MAX_DESCRIPTION]
    if color is not None:
        sighting.color = _normalize_color(color)
    if is_ear_tipped is not None:
        sighting.is_ear_tipped = is_ear_tipped
    if is_stray is not None:
        sighting.is_stray = is_stray

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
    sighting = db.get(Sighting, sighting_id)
    if sighting is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    if sighting.creator_token != token:
        raise HTTPException(status_code=403, detail="Not your sighting.")
    db.delete(sighting)  # cascades to confirmations and reports
    db.commit()
    return Response(status_code=204)
