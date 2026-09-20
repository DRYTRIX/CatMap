"""Public aggregate statistics."""

from collections import Counter
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import no_cache
from ..models import Confirmation, Sighting

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
def get_stats(db: Session = Depends(get_db), _: None = Depends(no_cache)) -> dict:
    """Return public aggregate counts."""
    total = db.scalar(
        select(func.count()).select_from(Sighting).where(Sighting.status == "active")
    )
    return {"total_cats": int(total or 0)}


def _share(true_count: int, known_count: int) -> float | None:
    """Fraction of sightings with a known value that are True (None if none known)."""
    return round(true_count / known_count, 3) if known_count else None


@router.get("/detail")
def get_stats_detail(
    days: int = Query(30, ge=7, le=365),
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> dict:
    """Richer public aggregates. Contains no per-person data."""

    def count(*where) -> int:
        return int(db.scalar(select(func.count()).select_from(Sighting).where(*where)) or 0)

    active = Sighting.status == "active"
    ear_known = count(active, Sighting.is_ear_tipped.is_not(None))
    stray_known = count(active, Sighting.is_stray.is_not(None))

    cutoff = datetime.now(UTC) - timedelta(days=days - 1)
    created = db.scalars(
        select(Sighting.created_at).where(
            Sighting.created_at >= cutoff.replace(hour=0, minute=0, second=0, microsecond=0),
            Sighting.status.in_(("active", "found", "gone")),
        )
    ).all()
    by_day = Counter(c.date() for c in created)
    today = datetime.now(UTC).date()
    series = [
        {"date": (today - timedelta(days=i)).isoformat(), "count": by_day.get(today - timedelta(days=i), 0)}
        for i in range(days - 1, -1, -1)
    ]

    return {
        "total_cats": count(active),
        "missing_active": count(active, Sighting.kind == "missing"),
        "reunited": count(
            Sighting.status == "found",
            Sighting.kind == "missing",
            (Sighting.found_outcome.is_(None)) | (Sighting.found_outcome != "deceased"),
        ),
        "confirmations_total": int(
            db.scalar(
                select(func.count())
                .select_from(Confirmation)
                .join(Sighting, Sighting.id == Confirmation.sighting_id)
                .where(active)
            )
            or 0
        ),
        "ear_tipped_share": _share(count(active, Sighting.is_ear_tipped.is_(True)), ear_known),
        "stray_share": _share(count(active, Sighting.is_stray.is_(True)), stray_known),
        "sightings_by_day": series,
    }
