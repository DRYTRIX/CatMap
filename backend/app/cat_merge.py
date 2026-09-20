"""Merging duplicate cat profiles.

``merge_cats`` folds one profile (``source``) into another (``target``): its
sightings are re-linked, hearts and watches are moved (deduplicated per
device), and the source profile is removed.
"""

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from .models import Cat, CatMergeSuggestion, CatReport, Heart, Sighting, Watch


def _move_unique(db: Session, model, source_id: str, target_id: str, key: str) -> None:
    """Retarget rows of ``model`` (cat targets) from source to target, dropping
    rows whose ``key`` (device token) already has one on the target."""
    existing = set(
        db.scalars(
            select(getattr(model, key)).where(
                model.target_type == "cat", model.target_id == target_id
            )
        ).all()
    )
    rows = db.scalars(
        select(model).where(model.target_type == "cat", model.target_id == source_id)
    ).all()
    for row in rows:
        owner = getattr(row, key)
        if owner in existing:
            db.delete(row)
        else:
            row.target_id = target_id
            existing.add(owner)
    db.flush()


def merge_cats(db: Session, source: Cat, target: Cat) -> Cat:
    """Fold ``source`` into ``target`` and delete ``source``. Commits."""
    if source.id == target.id:
        raise ValueError("Cannot merge a cat into itself.")

    source_id, target_id = source.id, target.id
    db.execute(update(Sighting).where(Sighting.cat_id == source_id).values(cat_id=target_id))
    _move_unique(db, Heart, source_id, target_id, "device_token")
    _move_unique(db, Watch, source_id, target_id, "device_token")

    target.hearts_count = int(
        db.scalar(
            select(func.count())
            .select_from(Heart)
            .where(Heart.target_type == "cat", Heart.target_id == target_id)
        )
        or 0
    )
    if not target.name and source.name:
        target.name = source.name

    db.execute(
        delete(CatMergeSuggestion).where(
            (CatMergeSuggestion.from_cat_id == source_id)
            | (CatMergeSuggestion.into_cat_id == source_id)
        )
    )
    db.execute(delete(CatReport).where(CatReport.cat_id == source_id))
    db.delete(source)
    db.commit()
    db.refresh(target)
    return target
