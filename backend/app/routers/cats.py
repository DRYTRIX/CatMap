"""Cat profiles — group multiple sightings of the same individual cat."""

from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..cat_merge import merge_cats
from ..config import get_settings
from ..database import get_db
from ..deps import no_cache
from ..identity import Identity, optional_identity, writable_identity
from ..models import Cat, CatMergeSuggestion, CatReport, Heart, Sighting, Watch
from ..ratelimit import limiter
from ..schemas import (
    CatProfile,
    CatProfileSighting,
    CatSummary,
    MergeSuggestionOut,
    ReportResult,
)

router = APIRouter(prefix="/cats", tags=["cats"])
settings = get_settings()

MAX_CAT_NAME = 50


def _thumb_url(sighting_id: str) -> str:
    return f"/api/sightings/{sighting_id}/thumbnail"


def _get_own_sighting(db: Session, sighting_id: str, ident: Identity) -> Sighting:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    if sighting.creator_token not in ident.tokens:
        raise HTTPException(status_code=403, detail="Not your sighting.")
    return sighting


def _get_own_cat(db: Session, cat_id: str, ident: Identity) -> Cat:
    cat = db.get(Cat, cat_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Cat profile not found.")
    if cat.creator_token not in ident.tokens:
        raise HTTPException(status_code=403, detail="Not your cat profile.")
    return cat


def _is_watching(db: Session, tokens: frozenset[str] | None, cat_id: str) -> bool:
    if not tokens:
        return False
    return (
        db.execute(
            select(Watch.id).where(
                Watch.device_token.in_(tokens),
                Watch.target_type == "cat",
                Watch.target_id == cat_id,
            )
        ).scalar_one_or_none()
        is not None
    )


def _is_hearted(
    db: Session,
    tokens: frozenset[str] | None,
    user_id: str | None,
    cat_id: str,
) -> bool:
    if user_id:
        if (
            db.execute(
                select(Heart.id).where(
                    Heart.user_id == user_id,
                    Heart.target_type == "cat",
                    Heart.target_id == cat_id,
                )
            ).scalar_one_or_none()
            is not None
        ):
            return True
    if not tokens:
        return False
    return (
        db.execute(
            select(Heart.id).where(
                Heart.device_token.in_(tokens),
                Heart.target_type == "cat",
                Heart.target_id == cat_id,
            )
        ).scalar_one_or_none()
        is not None
    )


def _profile(
    cat: Cat,
    sightings: list[Sighting],
    *,
    db: Session,
    tokens: frozenset[str] | None = None,
    user_id: str | None = None,
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
        "is_mine": bool(tokens and cat.creator_token in tokens),
        "watching": _is_watching(db, tokens, cat.id),
        "hearted": _is_hearted(db, tokens, user_id, cat.id),
        "hearts_count": int(getattr(cat, "hearts_count", 0) or 0),
    }


def _active_sightings(db: Session, cat_id: str) -> list[Sighting]:
    stmt = (
        select(Sighting)
        .where(Sighting.cat_id == cat_id, Sighting.status == "active")
        .options(selectinload(Sighting.photos))
        .order_by(Sighting.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


@router.get("", response_model=list[CatSummary])
def list_cats(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    near_lat: float | None = None,
    near_lng: float | None = None,
    radius_km: float | None = Query(None, ge=0.1, le=500),
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> list[dict]:
    """Browse/search cat profiles that have at least one active sighting."""
    if (near_lat is None) ^ (near_lng is None):
        raise HTTPException(status_code=400, detail="Provide both near_lat and near_lng.")
    if radius_km is not None and (near_lat is None or near_lng is None):
        raise HTTPException(status_code=400, detail="radius_km requires near_lat and near_lng.")

    # Each cat's most recent active sighting supplies its card location/thumbnail.
    latest_subq = (
        select(
            Sighting.cat_id.label("cat_id"),
            func.max(Sighting.created_at).label("max_created_at"),
        )
        .where(Sighting.cat_id.is_not(None), Sighting.status == "active")
        .group_by(Sighting.cat_id)
        .subquery()
    )

    stmt = (
        select(Cat, Sighting)
        .join(latest_subq, latest_subq.c.cat_id == Cat.id)
        .join(
            Sighting,
            (Sighting.cat_id == Cat.id)
            & (Sighting.created_at == latest_subq.c.max_created_at)
            & (Sighting.status == "active"),
        )
    )
    if q:
        needle = f"%{q.strip()[:MAX_CAT_NAME]}%"
        stmt = stmt.where(Cat.name.ilike(needle))
    if near_lat is not None and near_lng is not None and radius_km:
        deg = radius_km / 111.0
        stmt = stmt.where(
            Sighting.lat >= near_lat - deg,
            Sighting.lat <= near_lat + deg,
            Sighting.lng >= near_lng - deg,
            Sighting.lng <= near_lng + deg,
        )

    stmt = stmt.order_by(latest_subq.c.max_created_at.desc()).offset(offset).limit(limit)
    rows = db.execute(stmt).all()

    results = []
    for cat, sighting in rows:
        if near_lat is not None and near_lng is not None and radius_km:
            from ..user_notifications import _haversine_km

            if _haversine_km(near_lat, near_lng, sighting.lat, sighting.lng) > radius_km:
                continue
        sighting_count = db.execute(
            select(func.count())
            .select_from(Sighting)
            .where(Sighting.cat_id == cat.id, Sighting.status == "active")
        ).scalar_one()
        results.append(
            {
                "id": cat.id,
                "name": cat.name,
                "lat": sighting.lat,
                "lng": sighting.lng,
                "thumbnail_url": _thumb_url(sighting.id),
                "sighting_count": sighting_count,
                "last_seen_at": sighting.last_seen_at or sighting.created_at,
                "hearts_count": int(getattr(cat, "hearts_count", 0) or 0),
                "kind": sighting.kind,
            }
        )
    return results


@router.post("", response_model=CatProfile, status_code=201)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def create_cat(
    request: Request,
    sighting_ids: str = Form(...),
    name: str | None = Form(None),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> dict:
    """Create a cat profile from one or more of your own sightings (comma-separated IDs)."""
    ids = [s.strip() for s in sighting_ids.split(",") if s.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="Provide at least one sighting id.")

    sightings: list[Sighting] = []
    for sid in ids:
        sightings.append(_get_own_sighting(db, sid, ident))

    cat = Cat(
        name=(name or "").strip()[:MAX_CAT_NAME] or None,
        creator_token=ident.device_token,
    )
    db.add(cat)
    db.flush()

    for s in sightings:
        s.cat_id = cat.id

    db.commit()
    db.refresh(cat)
    return _profile(cat, sightings, db=db, tokens=ident.tokens, user_id=ident.user_id)


@router.get("/{cat_id}", response_model=CatProfile)
def get_cat(
    cat_id: str,
    ident: Identity | None = Depends(optional_identity),
    db: Session = Depends(get_db),
) -> dict:
    """Public cat profile with linked active sightings."""
    cat = db.get(Cat, cat_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Cat profile not found.")

    sightings = _active_sightings(db, cat_id)
    if not sightings:
        raise HTTPException(status_code=404, detail="Cat profile not found.")
    tokens = ident.tokens if ident else None
    user_id = ident.user_id if ident else None
    return _profile(cat, sightings, db=db, tokens=tokens, user_id=user_id)


@router.patch("/{cat_id}", response_model=CatProfile)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def rename_cat(
    request: Request,
    cat_id: str,
    name: str = Form(""),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> dict:
    """Rename one of your cat profiles."""
    cat = _get_own_cat(db, cat_id, ident)
    cat.name = (name or "").strip()[:MAX_CAT_NAME] or None
    db.commit()
    db.refresh(cat)
    sightings = _active_sightings(db, cat_id)
    return _profile(cat, sightings, db=db, tokens=ident.tokens, user_id=ident.user_id)


@router.post("/{cat_id}/link", response_model=CatProfile)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def link_sighting(
    request: Request,
    cat_id: str,
    sighting_id: str = Form(...),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> dict:
    """Attach one of your sightings to an existing cat profile."""
    cat = _get_own_cat(db, cat_id, ident)
    sighting = _get_own_sighting(db, sighting_id, ident)
    if sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")
    sighting.cat_id = cat.id
    db.commit()

    sightings = _active_sightings(db, cat_id)
    db.refresh(cat)
    return _profile(cat, sightings, db=db, tokens=ident.tokens, user_id=ident.user_id)


@router.post("/{cat_id}/unlink", response_model=CatProfile)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def unlink_sighting(
    request: Request,
    cat_id: str,
    sighting_id: str = Form(...),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> dict:
    """Detach one of your sightings from a cat profile."""
    cat = _get_own_cat(db, cat_id, ident)
    sighting = _get_own_sighting(db, sighting_id, ident)
    if sighting.cat_id != cat.id:
        raise HTTPException(status_code=400, detail="Sighting is not linked to this cat.")
    sighting.cat_id = None
    db.commit()

    sightings = _active_sightings(db, cat_id)
    db.refresh(cat)
    if not sightings:
        return _profile(cat, [], db=db, tokens=ident.tokens, user_id=ident.user_id)
    return _profile(cat, sightings, db=db, tokens=ident.tokens, user_id=ident.user_id)


# ---------- "Same cat?" merge suggestions ----------


def _owns(cat: Cat | None, ident: Identity) -> bool:
    return cat is not None and cat.creator_token in ident.tokens


def _suggestion_out(
    db: Session, s: CatMergeSuggestion, ident: Identity, *, merged: bool = False
) -> dict:
    from_cat = db.get(Cat, s.from_cat_id)
    into_cat = db.get(Cat, s.into_cat_id)
    can_respond = s.status == "pending" and (
        (_owns(from_cat, ident) and not s.from_approved)
        or (_owns(into_cat, ident) and not s.into_approved)
    )
    return {
        "id": s.id,
        "status": s.status,
        "from_cat_id": s.from_cat_id,
        "into_cat_id": s.into_cat_id,
        "from_name": from_cat.name if from_cat else None,
        "into_name": into_cat.name if into_cat else None,
        "from_approved": s.from_approved,
        "into_approved": s.into_approved,
        "can_respond": can_respond,
        "merged": merged,
    }


def _merged_out(
    suggestion_id: str, from_id: str, into_id: str, from_name: str | None, into_name: str | None
) -> dict:
    return {
        "id": suggestion_id,
        "status": "accepted",
        "from_cat_id": from_id,
        "into_cat_id": into_id,
        "from_name": from_name,
        "into_name": into_name,
        "from_approved": True,
        "into_approved": True,
        "can_respond": False,
        "merged": True,
    }


def _finish_if_approved(db: Session, s: CatMergeSuggestion) -> bool:
    """Run the merge once both owners approved. Returns True if merged."""
    if not (s.from_approved and s.into_approved):
        return False
    source = db.get(Cat, s.from_cat_id)
    target = db.get(Cat, s.into_cat_id)
    if source is None or target is None:
        s.status = "rejected"
        s.resolved_at = datetime.now(UTC)
        db.commit()
        return False
    # merge_cats deletes every suggestion touching the source (including this one).
    merge_cats(db, source, target)
    return True


@router.post(
    "/{cat_id}/merge-suggestions", response_model=MergeSuggestionOut, status_code=201
)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def suggest_merge(
    request: Request,
    cat_id: str,
    background_tasks: BackgroundTasks,
    from_cat_id: str = Form(...),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> dict:
    """Suggest that ``from_cat_id`` is the same cat as ``cat_id`` (it would fold into it).

    Both owners must approve. Sides you own are approved automatically, so
    suggesting between two of your own profiles merges them right away.
    """
    into_cat = db.get(Cat, cat_id)
    from_cat = db.get(Cat, from_cat_id)
    if into_cat is None or from_cat is None:
        raise HTTPException(status_code=404, detail="Cat profile not found.")
    if into_cat.id == from_cat.id:
        raise HTTPException(status_code=400, detail="Pick two different cat profiles.")

    existing = db.scalars(
        select(CatMergeSuggestion).where(
            CatMergeSuggestion.status == "pending",
            (
                (CatMergeSuggestion.from_cat_id == from_cat.id)
                & (CatMergeSuggestion.into_cat_id == into_cat.id)
            )
            | (
                (CatMergeSuggestion.from_cat_id == into_cat.id)
                & (CatMergeSuggestion.into_cat_id == from_cat.id)
            ),
        )
    ).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="A suggestion for these cats already exists.")

    suggestion = CatMergeSuggestion(
        from_cat_id=from_cat.id,
        into_cat_id=into_cat.id,
        suggested_by=ident.device_token,
        from_approved=_owns(from_cat, ident),
        into_approved=_owns(into_cat, ident),
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)
    suggestion_id = suggestion.id

    from_name, into_name = from_cat.name, into_cat.name
    if _finish_if_approved(db, suggestion):
        return _merged_out(suggestion_id, from_cat_id, cat_id, from_name, into_name)

    from ..user_notifications import notify_inbox_and_push

    for cat, approved in ((from_cat, suggestion.from_approved), (into_cat, suggestion.into_approved)):
        if approved or cat.creator_token == ident.device_token:
            continue
        other = into_cat if cat is from_cat else from_cat
        background_tasks.add_task(
            notify_inbox_and_push,
            recipient_token=cat.creator_token,
            ntype="cat_merge_suggested",
            title="Same cat?",
            body=(
                f"Someone thinks {cat.name or 'your cat'} and "
                f"{other.name or 'another profile'} are the same cat."
            ),
            payload={"cat_id": cat.id, "suggestion_id": suggestion_id},
            url=f"/?c={cat.id}",
        )
    return _suggestion_out(db, suggestion, ident)


@router.get("/{cat_id}/merge-suggestions", response_model=list[MergeSuggestionOut])
def list_merge_suggestions(
    cat_id: str,
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> list[dict]:
    """Pending "same cat?" suggestions involving one of your cat profiles."""
    _get_own_cat(db, cat_id, ident)
    rows = db.scalars(
        select(CatMergeSuggestion)
        .where(
            CatMergeSuggestion.status == "pending",
            (CatMergeSuggestion.from_cat_id == cat_id)
            | (CatMergeSuggestion.into_cat_id == cat_id),
        )
        .order_by(CatMergeSuggestion.created_at.desc())
    ).all()
    return [_suggestion_out(db, s, ident) for s in rows]


def _get_respondable(db: Session, suggestion_id: str, ident: Identity) -> CatMergeSuggestion:
    s = db.get(CatMergeSuggestion, suggestion_id)
    if s is None or s.status != "pending":
        raise HTTPException(status_code=404, detail="Suggestion not found.")
    if not (_owns(db.get(Cat, s.from_cat_id), ident) or _owns(db.get(Cat, s.into_cat_id), ident)):
        raise HTTPException(status_code=403, detail="Not your cat profile.")
    return s


@router.post("/merge-suggestions/{suggestion_id}/accept", response_model=MergeSuggestionOut)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def accept_merge(
    request: Request,
    suggestion_id: str,
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> dict:
    s = _get_respondable(db, suggestion_id, ident)
    if _owns(db.get(Cat, s.from_cat_id), ident):
        s.from_approved = True
    if _owns(db.get(Cat, s.into_cat_id), ident):
        s.into_approved = True
    db.commit()
    into_id, from_id = s.into_cat_id, s.from_cat_id
    into_cat, from_cat = db.get(Cat, into_id), db.get(Cat, from_id)
    names = (from_cat.name if from_cat else None, into_cat.name if into_cat else None)
    if _finish_if_approved(db, s):
        return _merged_out(suggestion_id, from_id, into_id, *names)
    return _suggestion_out(db, s, ident)


@router.post("/merge-suggestions/{suggestion_id}/reject", response_model=MergeSuggestionOut)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def reject_merge(
    request: Request,
    suggestion_id: str,
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> dict:
    s = _get_respondable(db, suggestion_id, ident)
    s.status = "rejected"
    s.resolved_at = datetime.now(UTC)
    db.commit()
    return _suggestion_out(db, s, ident)


@router.post("/{cat_id}/report", response_model=ReportResult)
@limiter.limit(settings.rate_limit_report)
def report_cat(
    request: Request,
    cat_id: str,
    reason: str = Form(""),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> ReportResult:
    """Flag a cat profile for moderator review (once per device)."""
    from .sightings import ALLOWED_REPORT_REASONS

    if db.get(Cat, cat_id) is None:
        raise HTTPException(status_code=404, detail="Cat profile not found.")
    reason = (reason or "").strip()
    if reason and reason not in ALLOWED_REPORT_REASONS:
        raise HTTPException(status_code=400, detail="Invalid report reason.")
    db.add(CatReport(cat_id=cat_id, device_token=ident.device_token, reason=reason[:280]))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return ReportResult(reported=False, hidden=False)
    return ReportResult(reported=True, hidden=False)
