"""Watch / follow sightings and cat profiles for activity alerts."""

import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import no_cache
from ..identity import Identity, identity, writable_identity
from ..models import Cat, Sighting, Watch
from ..ratelimit import limiter
from ..schemas import WatchOut, WatchResult

router = APIRouter(tags=["watches"])
settings = get_settings()

ALLOWED_TYPES = {"sighting", "cat"}


def _validate_target(db: Session, target_type: str, target_id: str) -> None:
    if target_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid target_type.")
    if target_type == "sighting":
        row = db.get(Sighting, target_id)
        if row is None or row.status not in ("active", "found"):
            raise HTTPException(status_code=404, detail="Sighting not found.")
    else:
        row = db.get(Cat, target_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Cat profile not found.")


@router.get("/watches", response_model=list[WatchOut])
def list_watches(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ident: Identity = Depends(identity),
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> list[WatchOut]:
    rows = db.execute(
        select(Watch)
        .where(Watch.device_token.in_(ident.tokens))
        .order_by(Watch.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).scalars().all()
    return [
        WatchOut(
            id=w.id,
            target_type=w.target_type,
            target_id=w.target_id,
            created_at=w.created_at,
            lat=w.lat,
            lng=w.lng,
            radius_km=w.radius_km,
            label=w.label,
        )
        for w in rows
    ]


@router.post("/watches", response_model=WatchResult, status_code=201)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def create_watch(
    request: Request,
    target_type: str = Form(...),
    target_id: str = Form(...),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> WatchResult:
    ttype = target_type.strip().lower()
    tid = target_id.strip()
    _validate_target(db, ttype, tid)

    existing = db.execute(
        select(Watch).where(
            Watch.device_token.in_(ident.tokens),
            Watch.target_type == ttype,
            Watch.target_id == tid,
        )
    ).scalar_one_or_none()
    if existing:
        return WatchResult(watching=True, id=existing.id)

    row = Watch(device_token=ident.device_token, target_type=ttype, target_id=tid)
    db.add(row)
    db.commit()
    db.refresh(row)
    return WatchResult(watching=True, id=row.id)


MAX_AREA_WATCHES = 5


@router.post("/watches/areas", response_model=WatchOut, status_code=201)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def create_area_watch(
    request: Request,
    lat: float = Form(...),
    lng: float = Form(...),
    radius_km: float = Form(5.0),
    label: str = Form(""),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> WatchOut:
    """Get alerted (and included in the weekly digest) about new cats near a place."""
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Coordinates out of range.")
    if not (0.5 <= radius_km <= 50):
        raise HTTPException(status_code=400, detail="radius_km must be between 0.5 and 50.")
    count = db.scalar(
        select(func.count())
        .select_from(Watch)
        .where(Watch.device_token.in_(ident.tokens), Watch.target_type == "area")
    )
    if (count or 0) >= MAX_AREA_WATCHES:
        raise HTTPException(status_code=400, detail="Too many watched areas.")

    row = Watch(
        device_token=ident.device_token,
        target_type="area",
        target_id=str(uuid.uuid4()),
        lat=lat,
        lng=lng,
        radius_km=radius_km,
        label=(label or "").strip()[:60] or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return WatchOut(
        id=row.id,
        target_type=row.target_type,
        target_id=row.target_id,
        created_at=row.created_at,
        lat=row.lat,
        lng=row.lng,
        radius_km=row.radius_km,
        label=row.label,
    )


@router.delete("/watches", response_model=WatchResult)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def delete_watch(
    request: Request,
    target_type: str = Query(...),
    target_id: str = Query(...),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> WatchResult:
    ttype = target_type.strip().lower()
    tid = target_id.strip()
    rows = db.execute(
        select(Watch).where(
            Watch.device_token.in_(ident.tokens),
            Watch.target_type == ttype,
            Watch.target_id == tid,
        )
    ).scalars().all()
    for row in rows:
        db.delete(row)
    if rows:
        db.commit()
    return WatchResult(watching=False, id=None)
