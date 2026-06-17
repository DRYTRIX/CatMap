from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import AdminAction, Sighting
from ..schemas import AdminActionRow, AdminReportRow

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


MAX_PAGE_SIZE = 200


@router.get("/reports", response_model=list[AdminReportRow])
def list_reported(
    db: Session = Depends(get_db),
    sort: str = "reports",
    limit: int = 50,
    offset: int = 0,
) -> list[AdminReportRow]:
    """Sightings with at least one report, paginated.

    `sort` is "reports" (most-reported first, default) or "date" (newest first).
    """
    if sort not in ("reports", "date"):
        raise HTTPException(status_code=400, detail="sort must be 'reports' or 'date'.")
    if limit < 1 or limit > MAX_PAGE_SIZE:
        raise HTTPException(status_code=400, detail=f"limit must be 1-{MAX_PAGE_SIZE}.")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0.")

    order = (
        (Sighting.reports_count.desc(), Sighting.created_at.desc())
        if sort == "reports"
        else (Sighting.created_at.desc(),)
    )
    stmt = (
        select(Sighting)
        .where(Sighting.reports_count > 0)
        .order_by(*order)
        .limit(limit)
        .offset(offset)
    )
    rows = db.execute(stmt).scalars().all()
    return [
        AdminReportRow(
            id=s.id,
            lat=s.lat,
            lng=s.lng,
            description=s.description,
            status=s.status,
            reports_count=s.reports_count,
            confirmations_count=s.confirmations_count,
            cat_confidence=s.cat_confidence,
            created_at=s.created_at,
            # Public image routes 404 on hidden rows, so moderators use the
            # admin image routes below, which serve bytes regardless of status.
            thumbnail_url=f"/api/admin/sightings/{s.id}/thumbnail",
        )
        for s in rows
    ]


@router.get("/pending", response_model=list[AdminReportRow])
def list_pending(
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
) -> list[AdminReportRow]:
    """Sightings queued for review because cat detection was inconclusive."""
    if limit < 1 or limit > MAX_PAGE_SIZE:
        raise HTTPException(status_code=400, detail=f"limit must be 1-{MAX_PAGE_SIZE}.")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0.")

    stmt = (
        select(Sighting)
        .where(Sighting.status == "pending")
        .order_by(Sighting.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    rows = db.execute(stmt).scalars().all()
    return [
        AdminReportRow(
            id=s.id,
            lat=s.lat,
            lng=s.lng,
            description=s.description,
            status=s.status,
            reports_count=s.reports_count,
            confirmations_count=s.confirmations_count,
            cat_confidence=s.cat_confidence,
            created_at=s.created_at,
            thumbnail_url=f"/api/admin/sightings/{s.id}/thumbnail",
        )
        for s in rows
    ]


def _get_or_404(db: Session, sighting_id: str) -> Sighting:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    return sighting


def _record_action(db: Session, action: str, sighting_id: str) -> None:
    db.add(AdminAction(action=action, sighting_id=sighting_id))


@router.get("/sightings/{sighting_id}/thumbnail")
def admin_thumbnail(sighting_id: str, db: Session = Depends(get_db)) -> Response:
    """Thumbnail bytes for moderation — served even when hidden/gone."""
    sighting = _get_or_404(db, sighting_id)
    return Response(content=sighting.thumbnail, media_type=sighting.photo_mime)


@router.get("/sightings/{sighting_id}/photo")
def admin_photo(sighting_id: str, db: Session = Depends(get_db)) -> Response:
    """Full image bytes for moderation — served even when hidden/gone."""
    sighting = _get_or_404(db, sighting_id)
    return Response(content=sighting.photo, media_type=sighting.photo_mime)


@router.post("/sightings/{sighting_id}/hide")
def hide(sighting_id: str, db: Session = Depends(get_db)) -> dict:
    sighting = _get_or_404(db, sighting_id)
    sighting.status = "hidden"
    _record_action(db, "hide", sighting.id)
    db.commit()
    return {"id": sighting.id, "status": sighting.status}


@router.post("/sightings/{sighting_id}/unhide")
def unhide(sighting_id: str, db: Session = Depends(get_db)) -> dict:
    sighting = _get_or_404(db, sighting_id)
    sighting.status = "active"
    _record_action(db, "unhide", sighting.id)
    db.commit()
    return {"id": sighting.id, "status": sighting.status}


@router.post("/sightings/{sighting_id}/approve")
def approve(sighting_id: str, db: Session = Depends(get_db)) -> dict:
    sighting = _get_or_404(db, sighting_id)
    sighting.status = "active"
    _record_action(db, "approve", sighting.id)
    db.commit()
    return {"id": sighting.id, "status": sighting.status}


@router.delete("/sightings/{sighting_id}", status_code=204)
def admin_delete(sighting_id: str, db: Session = Depends(get_db)):
    sighting = _get_or_404(db, sighting_id)
    _record_action(db, "delete", sighting.id)
    db.delete(sighting)
    db.commit()


@router.get("/actions", response_model=list[AdminActionRow])
def list_actions(
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
) -> list[AdminActionRow]:
    """Recent moderation actions (hide/unhide/delete), newest first."""
    if limit < 1 or limit > MAX_PAGE_SIZE:
        raise HTTPException(status_code=400, detail=f"limit must be 1-{MAX_PAGE_SIZE}.")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0.")

    stmt = (
        select(AdminAction)
        .order_by(AdminAction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = db.execute(stmt).scalars().all()
    return [
        AdminActionRow(
            id=a.id,
            action=a.action,
            sighting_id=a.sighting_id,
            created_at=a.created_at,
        )
        for a in rows
    ]
