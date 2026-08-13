"""Shared test fixtures.

Runs the real FastAPI app. Locally this uses in-memory SQLite; CI can set
DATABASE_URL to Postgres so the same suite hits a real database.
Rate limiting is disabled by default, with a low create/mutate limit so the
rate-limit tests can exercise 429s.
"""

import io
import os

_provided_db = os.environ.get("DATABASE_URL", "")
USE_POSTGRES = _provided_db.startswith("postgresql")
if not USE_POSTGRES:
    # Use SQLite before importing the app so the module-level engine doesn't
    # pull in the psycopg (Postgres) driver.
    os.environ["DATABASE_URL"] = "sqlite://"

os.environ["RATE_LIMIT_CREATE"] = "5/minute"
os.environ["RATE_LIMIT_CONFIRM"] = "1000/minute"
os.environ["RATE_LIMIT_REPORT"] = "1000/minute"
os.environ["RATE_LIMIT_ISSUE"] = "1000/minute"
os.environ["RATE_LIMIT_MUTATE"] = "5/minute"
os.environ["ADMIN_TOKEN"] = "test-admin"
os.environ["CORS_ORIGINS"] = "*"
os.environ["CAT_DETECTION_ENABLED"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from PIL.TiffImagePlugin import IFDRational  # noqa: E402

import app.database as db  # noqa: E402

if not USE_POSTGRES:
    from sqlalchemy import create_engine  # noqa: E402
    from sqlalchemy.orm import sessionmaker  # noqa: E402
    from sqlalchemy.pool import StaticPool  # noqa: E402

    db.engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    db.SessionLocal = sessionmaker(bind=db.engine, autoflush=False, expire_on_commit=False)

import app.models  # noqa: E402,F401
import app.main as main_module  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

# Health check reads main_module.engine (bound at import).
main_module.engine = db.engine
db.Base.metadata.create_all(bind=db.engine)
limiter.enabled = False  # individual tests can re-enable


@pytest.fixture(autouse=True)
def _clean_db():
    """Wipe tables between tests for isolation."""
    yield
    with db.engine.begin() as conn:
        if USE_POSTGRES:
            names = ", ".join(f'"{t.name}"' for t in db.Base.metadata.sorted_tables)
            conn.exec_driver_sql(f"TRUNCATE {names} RESTART IDENTITY CASCADE")
        else:
            for table in reversed(db.Base.metadata.sorted_tables):
                conn.exec_driver_sql(f"DELETE FROM {table.name}")


@pytest.fixture
def client():
    return TestClient(fastapi_app)


def _make_image(with_gps: bool = False) -> bytes:
    img = Image.new("RGB", (640, 480), (200, 160, 90))
    buf = io.BytesIO()
    if with_gps:
        def r(n, d):
            return IFDRational(n, d)

        exif = Image.Exif()
        exif[0x8825] = {
            1: "N", 2: (r(48, 1), r(51, 1), r(3024, 100)),
            3: "E", 4: (r(2, 1), r(17, 1), r(4020, 100)),
        }
        img.save(buf, format="JPEG", exif=exif)
    else:
        img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def make_image():
    return _make_image


def create_sighting(client, token, lat=40.0, lng=-3.0, description="cat", **extra):
    data = {"lat": str(lat), "lng": str(lng), "description": description}
    data.update(extra)
    return client.post(
        "/api/sightings",
        headers={"X-Device-Token": token},
        files={"image": ("cat.jpg", _make_image(), "image/jpeg")},
        data=data,
    )
