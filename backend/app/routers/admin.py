from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import Sighting
from ..schemas import AdminReportRow

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("/reports", response_model=list[AdminReportRow])
def list_reported(db: Session = Depends(get_db)) -> list[AdminReportRow]:
    """All sightings with at least one report, most-reported first."""
    stmt = (
        select(Sighting)
        .where(Sighting.reports_count > 0)
        .order_by(Sighting.reports_count.desc(), Sighting.created_at.desc())
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
            created_at=s.created_at,
            thumbnail_url=f"/api/sightings/{s.id}/thumbnail",
        )
        for s in rows
    ]


def _get_or_404(db: Session, sighting_id: str) -> Sighting:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    return sighting


@router.post("/sightings/{sighting_id}/hide")
def hide(sighting_id: str, db: Session = Depends(get_db)) -> dict:
    sighting = _get_or_404(db, sighting_id)
    sighting.status = "hidden"
    db.commit()
    return {"id": sighting.id, "status": sighting.status}


@router.post("/sightings/{sighting_id}/unhide")
def unhide(sighting_id: str, db: Session = Depends(get_db)) -> dict:
    sighting = _get_or_404(db, sighting_id)
    sighting.status = "active"
    db.commit()
    return {"id": sighting.id, "status": sighting.status}


@router.delete("/sightings/{sighting_id}", status_code=204)
def admin_delete(sighting_id: str, db: Session = Depends(get_db)):
    sighting = _get_or_404(db, sighting_id)
    db.delete(sighting)
    db.commit()
