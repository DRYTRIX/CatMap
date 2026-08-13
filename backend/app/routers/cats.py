"""Cat profiles — group multiple sightings of the same individual cat."""

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..config import get_settings
from ..database import get_db
from ..deps import optional_device_token, writable_device_token
from ..models import Cat, Sighting, Watch
from ..ratelimit import limiter
from ..schemas import CatProfile, CatProfileSighting

router = APIRouter(prefix="/cats", tags=["cats"])
settings = get_settings()

MAX_CAT_NAME = 50


def _thumb_url(sighting_id: str) -> str:
    return f"/api/sightings/{sighting_id}/thumbnail"


def _get_own_sighting(db: Session, sighting_id: str, token: str) -> Sighting:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    if sighting.creator_token != token:
        raise HTTPException(status_code=403, detail="Not your sighting.")
    return sighting


def _get_own_cat(db: Session, cat_id: str, token: str) -> Cat:
    cat = db.get(Cat, cat_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Cat profile not found.")
    if cat.creator_token != token:
        raise HTTPException(status_code=403, detail="Not your cat profile.")
    return cat


def _is_watching(db: Session, token: str | None, cat_id: str) -> bool:
    if not token:
        return False
    return (
        db.execute(
            select(Watch.id).where(
                Watch.device_token == token,
                Watch.target_type == "cat",
                Watch.target_id == cat_id,
            )
        ).scalar_one_or_none()
        is not None
    )


def _profile(
    cat: Cat,
    sightings: list[Sighting],
    *,
    db: Session,
    token: str | None = None,
) -> dict:
    active = [s for s in sightings if s.status == "active"]
    if not active:
        active = sightings
    active.sort(key=lambda s: s.created_at)

    first_seen = active[0].created_at if active else cat.created_at
    last_seen = max(
        (s.last_seen_at or s.created_at for s in active),
        default=cat.created_at,
    )

    # Summarize attributes from the most recent active sighting.
    latest = active[-1] if active else None

    return {
        "id": cat.id,
        "name": cat.name,
        "created_at": cat.created_at,
        "sightings": [
            CatProfileSighting(
                id=s.id,
                lat=s.lat,
                lng=s.lng,
                description=s.description,
                created_at=s.created_at,
                last_seen_at=s.last_seen_at,
                thumbnail_url=_thumb_url(s.id),
                confirmations_count=s.confirmations_count,
            )
            for s in active
        ],
        "first_seen_at": first_seen,
        "last_seen_at": last_seen,
        "sighting_count": len(active),
        "color": latest.color if latest else None,
        "is_ear_tipped": latest.is_ear_tipped if latest else None,
        "is_stray": latest.is_stray if latest else None,
        "is_mine": bool(token and cat.creator_token == token),
        "watching": _is_watching(db, token, cat.id),
    }


def _active_sightings(db: Session, cat_id: str) -> list[Sighting]:
    stmt = (
        select(Sighting)
        .where(Sighting.cat_id == cat_id, Sighting.status == "active")
        .options(selectinload(Sighting.photos))
        .order_by(Sighting.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=CatProfile, status_code=201)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def create_cat(
    request: Request,
    sighting_ids: str = Form(...),
    name: str | None = Form(None),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Create a cat profile from one or more of your own sightings (comma-separated IDs)."""
    ids = [s.strip() for s in sighting_ids.split(",") if s.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="Provide at least one sighting id.")

    sightings: list[Sighting] = []
    for sid in ids:
        sightings.append(_get_own_sighting(db, sid, token))

    cat = Cat(
        name=(name or "").strip()[:MAX_CAT_NAME] or None,
        creator_token=token,
    )
    db.add(cat)
    db.flush()

    for s in sightings:
        s.cat_id = cat.id

    db.commit()
    db.refresh(cat)
    return _profile(cat, sightings, db=db, token=token)


@router.get("/{cat_id}", response_model=CatProfile)
def get_cat(
    cat_id: str,
    token: str | None = Depends(optional_device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Public cat profile with linked active sightings."""
    cat = db.get(Cat, cat_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Cat profile not found.")

    sightings = _active_sightings(db, cat_id)
    if not sightings:
        raise HTTPException(status_code=404, detail="Cat profile not found.")
    return _profile(cat, sightings, db=db, token=token)


@router.patch("/{cat_id}", response_model=CatProfile)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def rename_cat(
    request: Request,
    cat_id: str,
    name: str = Form(""),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Rename one of your cat profiles."""
    cat = _get_own_cat(db, cat_id, token)
    cat.name = (name or "").strip()[:MAX_CAT_NAME] or None
    db.commit()
    db.refresh(cat)
    sightings = _active_sightings(db, cat_id)
    return _profile(cat, sightings, db=db, token=token)


@router.post("/{cat_id}/link", response_model=CatProfile)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def link_sighting(
    request: Request,
    cat_id: str,
    sighting_id: str = Form(...),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Attach one of your sightings to an existing cat profile."""
    cat = _get_own_cat(db, cat_id, token)
    sighting = _get_own_sighting(db, sighting_id, token)
    if sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")
    sighting.cat_id = cat.id
    db.commit()

    sightings = _active_sightings(db, cat_id)
    db.refresh(cat)
    return _profile(cat, sightings, db=db, token=token)


@router.post("/{cat_id}/unlink", response_model=CatProfile)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def unlink_sighting(
    request: Request,
    cat_id: str,
    sighting_id: str = Form(...),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Detach one of your sightings from a cat profile."""
    cat = _get_own_cat(db, cat_id, token)
    sighting = _get_own_sighting(db, sighting_id, token)
    if sighting.cat_id != cat.id:
        raise HTTPException(status_code=400, detail="Sighting is not linked to this cat.")
    sighting.cat_id = None
    db.commit()

    sightings = _active_sightings(db, cat_id)
    db.refresh(cat)
    if not sightings:
        # Profile with no remaining sightings is still returned empty for the owner.
        return _profile(cat, [], db=db, token=token)
    return _profile(cat, sightings, db=db, token=token)
