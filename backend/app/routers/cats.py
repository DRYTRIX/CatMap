"""Cat profiles — group multiple sightings of the same individual cat."""

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import device_token
from ..models import Cat, Sighting
from ..schemas import CatProfile, CatProfileSighting

router = APIRouter(prefix="/cats", tags=["cats"])

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


def _profile(cat: Cat, sightings: list[Sighting]) -> dict:
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
    }


@router.post("", response_model=CatProfile, status_code=201)
def create_cat(
    sighting_ids: str = Form(...),
    name: str | None = Form(None),
    token: str = Depends(device_token),
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
    return _profile(cat, sightings)


@router.get("/{cat_id}", response_model=CatProfile)
def get_cat(
    cat_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """Public cat profile with linked active sightings."""
    cat = db.get(Cat, cat_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Cat profile not found.")

    stmt = (
        select(Sighting)
        .where(Sighting.cat_id == cat_id, Sighting.status == "active")
        .options(selectinload(Sighting.photos))
        .order_by(Sighting.created_at.asc())
    )
    sightings = list(db.execute(stmt).scalars().all())
    if not sightings:
        raise HTTPException(status_code=404, detail="Cat profile not found.")
    return _profile(cat, sightings)


@router.post("/{cat_id}/link", response_model=CatProfile)
def link_sighting(
    cat_id: str,
    sighting_id: str = Form(...),
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Attach one of your sightings to an existing cat profile."""
    cat = _get_own_cat(db, cat_id, token)
    sighting = _get_own_sighting(db, sighting_id, token)
    if sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")
    sighting.cat_id = cat.id
    db.commit()

    stmt = (
        select(Sighting)
        .where(Sighting.cat_id == cat_id, Sighting.status == "active")
        .order_by(Sighting.created_at.asc())
    )
    sightings = list(db.execute(stmt).scalars().all())
    db.refresh(cat)
    return _profile(cat, sightings)


@router.post("/{cat_id}/unlink", response_model=CatProfile)
def unlink_sighting(
    cat_id: str,
    sighting_id: str = Form(...),
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> dict:
    """Detach one of your sightings from a cat profile."""
    cat = _get_own_cat(db, cat_id, token)
    sighting = _get_own_sighting(db, sighting_id, token)
    if sighting.cat_id != cat.id:
        raise HTTPException(status_code=400, detail="Sighting is not linked to this cat.")
    sighting.cat_id = None
    db.commit()

    stmt = (
        select(Sighting)
        .where(Sighting.cat_id == cat_id, Sighting.status == "active")
        .order_by(Sighting.created_at.asc())
    )
    sightings = list(db.execute(stmt).scalars().all())
    db.refresh(cat)
    return _profile(cat, sightings)
