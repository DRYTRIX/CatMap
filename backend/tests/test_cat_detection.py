"""Tests for server-side cat detection."""

import io
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image

from app import cat_detection
from app.cat_detection import DetectionResult

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fetch_model import is_valid_model  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_detection_state():
    cat_detection._session = None
    cat_detection._session_failed = False
    yield
    cat_detection._session = None
    cat_detection._session_failed = False


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 160, 90)).save(buf, format="JPEG")
    return buf.getvalue()


def _yolo_output(cat_score: float = 0.95, dog_score: float = 0.0) -> np.ndarray:
    output = np.zeros((1, 300, 6), dtype=np.float32)
    output[0, 0] = [0, 0, 100, 100, cat_score, cat_detection.COCO_CAT_CLASS_ID]
    if dog_score > 0:
        output[0, 1] = [0, 0, 100, 100, dog_score, cat_detection.COCO_DOG_CLASS_ID]
    return output


def test_is_valid_model_rejects_lfs_pointer(tmp_path):
    path = tmp_path / "bad.onnx"
    path.write_text("version https://git-lfs.github.com/spec/v1\noid sha256:abc\n")
    assert is_valid_model(path) is False


def test_is_valid_model_rejects_small_file(tmp_path):
    path = tmp_path / "tiny.onnx"
    path.write_bytes(b"\x00" * 100)
    assert is_valid_model(path) is False


def test_is_valid_model_accepts_large_binary(tmp_path):
    path = tmp_path / "good.onnx"
    path.write_bytes(b"\x08" + b"\x00" * (20_000_001))
    assert is_valid_model(path) is True


def test_detect_cat_disabled(monkeypatch):
    monkeypatch.setenv("CAT_DETECTION_ENABLED", "false")
    from app.config import get_settings

    get_settings.cache_clear()
    assert cat_detection.detect_cat(_jpeg_bytes()) is None
    assert cat_detection.get_detection_status() == "disabled"
    get_settings.cache_clear()


def test_detect_cat_no_model_returns_none(monkeypatch):
    monkeypatch.setenv("CAT_DETECTION_ENABLED", "true")
    monkeypatch.setenv("CAT_DETECTION_MODEL_PATH", "/nonexistent/model.onnx")
    from app.config import get_settings

    get_settings.cache_clear()
    assert cat_detection.detect_cat(_jpeg_bytes()) is None
    assert cat_detection.get_detection_status() == "unavailable"
    get_settings.cache_clear()


def test_detect_cat_returns_cat_score(monkeypatch):
    monkeypatch.setenv("CAT_DETECTION_ENABLED", "true")
    monkeypatch.setenv("CAT_DETECTION_MODEL_PATH", "models/yolov10s.onnx")
    from app.config import get_settings

    get_settings.cache_clear()

    mock_session = MagicMock()
    mock_session.get_inputs.return_value = [MagicMock(name="images")]
    mock_session.run.return_value = [_yolo_output(0.95)]

    cat_detection._session = mock_session
    result = cat_detection.detect_cat(_jpeg_bytes())

    assert result is not None
    assert result.cat_score > 0.9
    assert result.animal_score >= result.cat_score
    assert cat_detection.get_detection_status() == "ready"
    get_settings.cache_clear()


def test_create_queues_low_cat_score_as_pending(client):
    from app.routers import sightings as sightings_router

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch.object(sightings_router.settings, "cat_detection_threshold", 0.99),
        patch("app.routers.sightings.get_detection_status", return_value="ready"),
        patch(
            "app.routers.sightings.detect_cat",
            return_value=DetectionResult(cat_score=0.1, animal_score=0.1),
        ),
    ):
        res = client.post(
            "/api/sightings",
            headers={"X-Device-Token": "user-cat"},
            files={"image": ("cat.jpg", _jpeg_bytes(), "image/jpeg")},
            data={"lat": "40.0", "lng": "-3.0"},
        )

    assert res.status_code == 201
    body = res.json()
    assert body["pending"] is True

    import app.database as db
    from app.models import Sighting

    with db.SessionLocal() as session:
        sighting = session.get(Sighting, body["id"])
        assert sighting.status == "pending"


def test_create_queues_as_pending_when_inference_fails(client):
    """Per-image inference errors (detect_cat -> None) must fail safe into review,
    not silently bypass moderation and publish straight to "active"."""
    from app.routers import sightings as sightings_router

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch("app.routers.sightings.get_detection_status", return_value="ready"),
        patch("app.routers.sightings.detect_cat", return_value=None),
    ):
        res = client.post(
            "/api/sightings",
            headers={"X-Device-Token": "user-noscore"},
            files={"image": ("cat.jpg", _jpeg_bytes(), "image/jpeg")},
            data={"lat": "40.0", "lng": "-3.0"},
        )

    assert res.status_code == 201
    body = res.json()
    assert body["pending"] is True

    import app.database as db
    from app.models import Sighting

    with db.SessionLocal() as session:
        sighting = session.get(Sighting, body["id"])
        assert sighting.status == "pending"
        assert sighting.cat_confidence is None


def test_create_rejects_when_detection_unavailable(client):
    from app.routers import sightings as sightings_router

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch("app.routers.sightings.get_detection_status", return_value="unavailable"),
    ):
        res = client.post(
            "/api/sightings",
            headers={"X-Device-Token": "user-unavail"},
            files={"image": ("cat.jpg", _jpeg_bytes(), "image/jpeg")},
            data={"lat": "40.0", "lng": "-3.0"},
        )

    assert res.status_code == 503
    assert "temporarily unavailable" in res.json()["detail"].lower()


def test_create_stores_cat_confidence(client):
    from app.routers import sightings as sightings_router

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch.object(sightings_router.settings, "cat_detection_threshold", 0.01),
        patch("app.routers.sightings.get_detection_status", return_value="ready"),
        patch(
            "app.routers.sightings.detect_cat",
            return_value=DetectionResult(cat_score=0.85, animal_score=0.85),
        ),
    ):
        res = client.post(
            "/api/sightings",
            headers={"X-Device-Token": "user-cat2"},
            files={"image": ("cat.jpg", _jpeg_bytes(), "image/jpeg")},
            data={"lat": "40.0", "lng": "-3.0"},
        )

    assert res.status_code == 201

    import app.database as db
    from app.models import Sighting

    with db.SessionLocal() as session:
        sighting = session.get(Sighting, res.json()["id"])
        assert sighting.cat_confidence == pytest.approx(0.85)


def test_healthz_reports_cat_detection(client, monkeypatch):
    monkeypatch.setenv("CAT_DETECTION_ENABLED", "true")
    monkeypatch.setenv("CAT_DETECTION_MODEL_PATH", "/nonexistent/model.onnx")
    from app.config import get_settings

    get_settings.cache_clear()
    cat_detection._session = None
    cat_detection._session_failed = False

    res = client.get("/healthz")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["cat_detection"] == "unavailable"
    get_settings.cache_clear()


def test_add_photos_accepts_animal_signal(client):
    from app.routers import sightings as sightings_router
    from tests.conftest import create_sighting

    sid = create_sighting(client, "owner-animal").json()["id"]

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch.object(sightings_router.settings, "cat_detection_animal_threshold", 0.30),
        patch("app.routers.sightings.get_detection_status", return_value="ready"),
        patch(
            "app.routers.sightings.detect_cat",
            return_value=DetectionResult(cat_score=0.1, animal_score=0.35),
        ),
    ):
        res = client.post(
            f"/api/sightings/{sid}/photos",
            headers={"X-Device-Token": "owner-animal"},
            files={"images": ("extra.jpg", _jpeg_bytes(), "image/jpeg")},
        )

    assert res.status_code == 200


def test_add_photos_rejects_low_animal_signal(client):
    from app.routers import sightings as sightings_router
    from tests.conftest import create_sighting

    sid = create_sighting(client, "owner-reject").json()["id"]

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch.object(sightings_router.settings, "cat_detection_animal_threshold", 0.30),
        patch("app.routers.sightings.get_detection_status", return_value="ready"),
        patch(
            "app.routers.sightings.detect_cat",
            return_value=DetectionResult(cat_score=0.1, animal_score=0.2),
        ),
    ):
        res = client.post(
            f"/api/sightings/{sid}/photos",
            headers={"X-Device-Token": "owner-reject"},
            files={"images": ("extra.jpg", _jpeg_bytes(), "image/jpeg")},
        )

    assert res.status_code == 400
    assert "doesn't look like a cat" in res.json()["detail"].lower()
