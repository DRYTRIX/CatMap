"""Hearts — server-side replacement for client-only favorites."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..identity import Identity, writable_identity
from ..models import Cat, Heart, Sighting, Watch
from ..ratelimit import limiter
from ..schemas import HeartImportResult, HeartOut, HeartResult

router = APIRouter(prefix="/hearts", tags=["hearts"])
settings = get_settings()

ALLOWED_TYPES = {"sighting", "cat"}


def _validate_target(db: Session, target_type: str, target_id: str) -> None:
    if target_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid target_type.")
    if target_type == "sighting":
        row = db.get(Sighting, target_id)
        if row is None or row.status not in ("active", "found", "gone", "hidden", "pending"):
            raise HTTPException(status_code=404, detail="Sighting not found.")
    else:
        row = db.get(Cat, target_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Cat profile not found.")


def _bump_count(db: Session, target_type: str, target_id: str, delta: int) -> int:
    if target_type == "sighting":
        row = db.get(Sighting, target_id)
    else:
        row = db.get(Cat, target_id)
    if row is None:
        return 0
    row.hearts_count = max(0, int(row.hearts_count or 0) + delta)
    return row.hearts_count


def _find_existing(
    db: Session, ident: Identity, target_type: str, target_id: str
) -> Heart | None:
    if ident.user_id:
        row = db.execute(
            select(Heart).where(
                Heart.user_id == ident.user_id,
                Heart.target_type == target_type,
                Heart.target_id == target_id,
            )
        ).scalar_one_or_none()
        if row:
            return row
    return db.execute(
        select(Heart).where(
            Heart.device_token == ident.device_token,
            Heart.target_type == target_type,
            Heart.target_id == target_id,
        )
    ).scalar_one_or_none()


def _ensure_watch(db: Session, device_token: str, target_type: str, target_id: str) -> None:
    existing = db.execute(
        select(Watch).where(
            Watch.device_token == device_token,
            Watch.target_type == target_type,
            Watch.target_id == target_id,
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            Watch(
                device_token=device_token,
                target_type=target_type,
                target_id=target_id,
            )
        )


@router.get("", response_model=list[HeartOut])
def list_hearts(
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> list[HeartOut]:
    if ident.user_id:
        rows = db.execute(
            select(Heart)
            .where(Heart.user_id == ident.user_id)
            .order_by(Heart.created_at.desc())
            .limit(500)
        ).scalars().all()
    else:
        rows = db.execute(
            select(Heart)
            .where(Heart.device_token == ident.device_token)
            .order_by(Heart.created_at.desc())
            .limit(500)
        ).scalars().all()
    return [
        HeartOut(
            id=h.id,
            target_type=h.target_type,
            target_id=h.target_id,
            created_at=h.created_at,
        )
        for h in rows
    ]


@router.post("", response_model=HeartResult, status_code=201)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def add_heart(
    request: Request,
    target_type: str = Form(...),
    target_id: str = Form(...),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> HeartResult:
    ttype = target_type.strip().lower()
    tid = target_id.strip()
    _validate_target(db, ttype, tid)

    existing = _find_existing(db, ident, ttype, tid)
    if existing:
        count = (
            db.get(Sighting, tid).hearts_count
            if ttype == "sighting"
            else db.get(Cat, tid).hearts_count
        )
        return HeartResult(hearted=True, hearts_count=int(count or 0), id=existing.id)

    heart = Heart(
        target_type=ttype,
        target_id=tid,
        device_token=ident.device_token,
        user_id=ident.user_id,
    )
    db.add(heart)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = _find_existing(db, ident, ttype, tid)
        count = 0
        if ttype == "sighting":
            row = db.get(Sighting, tid)
            count = int(row.hearts_count or 0) if row else 0
        else:
            row = db.get(Cat, tid)
            count = int(row.hearts_count or 0) if row else 0
        return HeartResult(
            hearted=True,
            hearts_count=count,
            id=existing.id if existing else None,
        )

    count = _bump_count(db, ttype, tid, 1)
    # Preserve favorites→watch side effect so reconfirmation alerts keep working.
    _ensure_watch(db, ident.device_token, ttype, tid)
    db.commit()
    db.refresh(heart)
    return HeartResult(hearted=True, hearts_count=count, id=heart.id)


@router.delete("", response_model=HeartResult)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def remove_heart(
    request: Request,
    target_type: str = Query(...),
    target_id: str = Query(...),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> HeartResult:
    ttype = target_type.strip().lower()
    tid = target_id.strip()
    existing = _find_existing(db, ident, ttype, tid)
    if existing is None:
        count = 0
        if ttype == "sighting":
            row = db.get(Sighting, tid)
            count = int(row.hearts_count or 0) if row else 0
        elif ttype == "cat":
            row = db.get(Cat, tid)
            count = int(row.hearts_count or 0) if row else 0
        return HeartResult(hearted=False, hearts_count=count, id=None)

    db.delete(existing)
    count = _bump_count(db, ttype, tid, -1)
    db.commit()
    return HeartResult(hearted=False, hearts_count=count, id=None)


@router.post("/import", response_model=HeartImportResult)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def import_hearts(
    request: Request,
    sighting_ids: str = Form(""),
    cat_ids: str = Form(""),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> HeartImportResult:
    """One-time migration from client-side favorites."""
    sids = [s.strip() for s in sighting_ids.split(",") if s.strip()]
    cids = [c.strip() for c in cat_ids.split(",") if c.strip()]
    imported = 0
    skipped = 0

    for tid, ttype in [(s, "sighting") for s in sids] + [(c, "cat") for c in cids]:
        if ttype == "sighting":
            row = db.get(Sighting, tid)
            if row is None:
                skipped += 1
                continue
        else:
            row = db.get(Cat, tid)
            if row is None:
                skipped += 1
                continue
        if _find_existing(db, ident, ttype, tid):
            skipped += 1
            continue
        db.add(
            Heart(
                target_type=ttype,
                target_id=tid,
                device_token=ident.device_token,
                user_id=ident.user_id,
            )
        )
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            skipped += 1
            continue
        _bump_count(db, ttype, tid, 1)
        _ensure_watch(db, ident.device_token, ttype, tid)
        imported += 1

    db.commit()
    return HeartImportResult(imported=imported, skipped=skipped)


def is_hearted(
    db: Session,
    ident: Identity | None,
    target_type: str,
    target_id: str,
) -> bool:
    if ident is None:
        return False
    return _find_existing(db, ident, target_type, target_id) is not None


# Helper kept here for other routers (avoid circular imports).
__all__ = ["router", "is_hearted"]
