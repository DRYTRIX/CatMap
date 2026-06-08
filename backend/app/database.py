import logging
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from alembic import command
from alembic.config import Config

from .config import get_settings

settings = get_settings()
logger = logging.getLogger("catmap")


def _normalize_db_url(url: str) -> str:
    """Ensure the URL uses the psycopg (v3) driver.

    Render and many providers hand out ``postgres://`` / ``postgresql://``
    strings; SQLAlchemy needs the explicit ``postgresql+psycopg://`` form.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


engine = create_engine(_normalize_db_url(settings.database_url), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _alembic_config() -> Config:
    ini_path = Path(__file__).resolve().parent.parent / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("sqlalchemy.url", _normalize_db_url(settings.database_url))
    return cfg


def _table_exists(table_name: str) -> bool:
    return inspect(engine).has_table(table_name)


def _alembic_version_exists() -> bool:
    return _table_exists("alembic_version")


def run_migrations() -> None:
    """Apply Alembic migrations, with brownfield bootstrap for pre-Alembic DBs."""
    # Import models so they register on Base.metadata.
    from . import models  # noqa: F401

    cfg = _alembic_config()

    if not _alembic_version_exists() and _table_exists("sightings"):
        logger.info(
            "Existing schema detected without alembic_version — stamping baseline 0001."
        )
        command.stamp(cfg, "0001")

    command.upgrade(cfg, "head")


def init_db() -> None:
    """Backward-compatible alias used by tests."""
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
