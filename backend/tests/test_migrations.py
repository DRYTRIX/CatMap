"""Verify Alembic migrations apply on a fresh SQLite database."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_alembic_upgrade_head(tmp_path):
    db_path = tmp_path / "migrations.db"
    url = f"sqlite:///{db_path}"

    backend_dir = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)

    command.upgrade(cfg, "head")

    engine = create_engine(url)
    insp = inspect(engine)
    assert insp.has_table("sightings")
    assert insp.has_table("confirmations")
    assert insp.has_table("reports")
    assert insp.has_table("photos")
    assert insp.has_table("alembic_version")

    columns = {c["name"] for c in insp.get_columns("sightings")}
    assert "cat_confidence" in columns
    assert "color" in columns
    assert "is_ear_tipped" in columns
    assert "is_stray" in columns

    photo_columns = {c["name"] for c in insp.get_columns("photos")}
    assert {"id", "sighting_id", "photo", "thumbnail", "photo_mime", "position"} <= photo_columns
