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
from ..models import Confirmation, Report, Sighting
from ..ratelimit import limiter
from ..schemas import (
    ConfirmResult,
    CreateSightingResult,
    ReportResult,
    SightingDetail,
    SightingDot,
)

router = APIRouter(prefix="/api/sightings", tags=["sightings"])
settings = get_settings()

MAX_DESCRIPTION = 1000


def _photo_url(sighting_id: str) -> str:
    return f"/api/sightings/{sighting_id}/photo"


def _thumb_url(sighting_id: str) -> str:
    return f"/api/sightings/{sighting_id}/thumbnail"


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
    }


@router.get("", response_model=list[SightingDot])
def list_sightings(
    min_lat: float,
    max_lat: float,
    min_lng: float,
    max_lng: float,
    db: Session = Depends(get_db),
) -> list[SightingDot]:
    """Return lightweight dots within the given bounding box."""
    if min_lat > max_lat or min_lng > max_lng:
        raise HTTPException(status_code=400, detail="Invalid bounding box.")

    stmt = (
        select(Sighting.id, Sighting.lat, Sighting.lng, Sighting.confirmations_count)
        .where(
            Sighting.status == "active",
            Sighting.lat >= min_lat,
            Sighting.lat <= max_lat,
            Sighting.lng >= min_lng,
            Sighting.lng <= max_lng,
        )
        .order_by(Sighting.created_at.desc())
        .limit(settings.max_dots_per_query)
    )
    rows = db.execute(stmt).all()
    return [
        SightingDot(id=r.id, lat=r.lat, lng=r.lng, confirmations_count=r.confirmations_count)
        for r in rows
    ]


@router.post("", response_model=CreateSightingResult, status_code=201)
@limiter.limit(settings.rate_limit_create)
async def create_sighting(
    request: Request,
    image: UploadFile = File(...),
    description: str = Form(""),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Create a sighting. Coordinates come from the form, or EXIF as a fallback."""
    raw = await image.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds {settings.max_upload_mb} MB limit.",
        )

    # Prefer client-supplied coordinates; fall back to EXIF GPS.
    if lat is None or lng is None:
        gps = extract_gps(raw)
        if gps is None:
            raise HTTPException(
                status_code=400,
                detail="No location provided and none found in the photo.",
            )
        lat, lng = gps

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Coordinates out of range.")

    try:
        main_bytes, thumb_bytes, mime = process_upload(
            raw,
            settings.image_max_edge,
            settings.thumbnail_max_edge,
            settings.max_image_pixels,
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

    score = detect_cat(main_bytes)
    if settings.cat_detection_enabled and score is not None:
        if settings.cat_detection_strict and score < settings.cat_detection_threshold:
            raise HTTPException(
                status_code=400,
                detail="We couldn't spot a cat in this photo. Try a clearer, closer shot.",
            )

    sighting = Sighting(
        lat=lat,
        lng=lng,
        description=(description or "").strip()[:MAX_DESCRIPTION],
        photo=main_bytes,
        thumbnail=thumb_bytes,
        photo_mime=mime,
        creator_token=token,
        cat_confidence=score,
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
