"""Public aggregate statistics."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Sighting

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
def get_stats(db: Session = Depends(get_db)) -> dict:
    """Return public aggregate counts."""
    total = db.scalar(
        select(func.count()).select_from(Sighting).where(Sighting.status == "active")
    )
    return {"total_cats": int(total or 0)}
