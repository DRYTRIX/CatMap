"""Watch / follow sightings and cat profiles for activity alerts."""

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import device_token, no_cache, writable_device_token
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
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> list[WatchOut]:
    rows = db.execute(
        select(Watch)
        .where(Watch.device_token == token)
        .order_by(Watch.created_at.desc())
        .limit(200)
    ).scalars().all()
    return [
        WatchOut(
            id=w.id,
            target_type=w.target_type,
            target_id=w.target_id,
            created_at=w.created_at,
        )
        for w in rows
    ]


@router.post("/watches", response_model=WatchResult, status_code=201)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def create_watch(
    request: Request,
    target_type: str = Form(...),
    target_id: str = Form(...),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> WatchResult:
    ttype = target_type.strip().lower()
    tid = target_id.strip()
    _validate_target(db, ttype, tid)

    existing = db.execute(
        select(Watch).where(
            Watch.device_token == token,
            Watch.target_type == ttype,
            Watch.target_id == tid,
        )
    ).scalar_one_or_none()
    if existing:
        return WatchResult(watching=True, id=existing.id)

    row = Watch(device_token=token, target_type=ttype, target_id=tid)
    db.add(row)
    db.commit()
    db.refresh(row)
    return WatchResult(watching=True, id=row.id)


@router.delete("/watches", response_model=WatchResult)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def delete_watch(
    request: Request,
    target_type: str = Query(...),
    target_id: str = Query(...),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> WatchResult:
    ttype = target_type.strip().lower()
    tid = target_id.strip()
    row = db.execute(
        select(Watch).where(
            Watch.device_token == token,
            Watch.target_type == ttype,
            Watch.target_id == tid,
        )
    ).scalar_one_or_none()
    if row:
        db.delete(row)
        db.commit()
    return WatchResult(watching=False, id=None)
