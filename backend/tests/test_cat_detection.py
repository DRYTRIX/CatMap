"""Tests for server-side cat detection."""

import io
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image

from app import cat_detection

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
    monkeypatch.setenv("CAT_DETECTION_MODEL_PATH", "models/ssd_mobilenet_v1_12.onnx")
    from app.config import get_settings

    get_settings.cache_clear()

    boxes = np.zeros((1, 10, 4), dtype=np.float32)
    classes = np.zeros((1, 10), dtype=np.float32)
    classes[0, 0] = cat_detection.COCO_CAT_CLASS_ID
    scores = np.zeros((1, 10), dtype=np.float32)
    scores[0, 0] = 0.95
    num = np.array([1.0], dtype=np.float32)

    mock_session = MagicMock()
    mock_session.get_inputs.return_value = [MagicMock(name="input")]
    mock_session.run.return_value = [boxes, classes, scores, num]

    cat_detection._session = mock_session
    score = cat_detection.detect_cat(_jpeg_bytes())

    assert score is not None
    assert score > 0.9
    assert cat_detection.get_detection_status() == "ready"
    get_settings.cache_clear()


def test_create_rejects_low_cat_score(client):
    from app.routers import sightings as sightings_router

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch.object(sightings_router.settings, "cat_detection_threshold", 0.99),
        patch("app.routers.sightings.get_detection_status", return_value="ready"),
        patch("app.routers.sightings.detect_cat", return_value=0.1),
    ):
        res = client.post(
            "/api/sightings",
            headers={"X-Device-Token": "user-cat"},
            files={"image": ("cat.jpg", _jpeg_bytes(), "image/jpeg")},
            data={"lat": "40.0", "lng": "-3.0"},
        )

    assert res.status_code == 400
    assert "couldn't spot a cat" in res.json()["detail"].lower()


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
        patch("app.routers.sightings.detect_cat", return_value=0.85),
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
