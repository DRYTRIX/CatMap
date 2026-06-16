"""Public aggregate statistics."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import no_cache
from ..models import Sighting

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
def get_stats(db: Session = Depends(get_db), _: None = Depends(no_cache)) -> dict:
    """Return public aggregate counts."""
    total = db.scalar(
        select(func.count()).select_from(Sighting).where(Sighting.status == "active")
    )
    return {"total_cats": int(total or 0)}
