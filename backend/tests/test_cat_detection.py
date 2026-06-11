"""Tests for server-side cat detection."""

import io
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image

from app import cat_detection


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


def _yolo_cat_output(score: float = 0.9) -> np.ndarray:
    output = np.zeros((1, 84, 8400), dtype=np.float32)
    output[0, 4 + cat_detection._COCO_CAT_CLASS, 0] = score
    return output


def test_detect_cat_disabled(monkeypatch):
    monkeypatch.setenv("CAT_DETECTION_ENABLED", "false")
    from app.config import get_settings

    get_settings.cache_clear()
    assert cat_detection.detect_cat(_jpeg_bytes()) is None
    get_settings.cache_clear()


def test_detect_cat_no_model_fails_open(monkeypatch):
    monkeypatch.setenv("CAT_DETECTION_ENABLED", "true")
    monkeypatch.setenv("CAT_DETECTION_MODEL_PATH", "/nonexistent/model.onnx")
    from app.config import get_settings

    get_settings.cache_clear()
    assert cat_detection.detect_cat(_jpeg_bytes()) is None
    get_settings.cache_clear()


def test_detect_cat_returns_cat_score(monkeypatch):
    monkeypatch.setenv("CAT_DETECTION_ENABLED", "true")
    monkeypatch.setenv("CAT_DETECTION_MODEL_PATH", "models/yolov8n.onnx")
    from app.config import get_settings

    get_settings.cache_clear()

    mock_session = MagicMock()
    mock_session.get_inputs.return_value = [MagicMock(name="images")]
    mock_session.run.return_value = [_yolo_cat_output(0.9)]

    with patch.object(cat_detection, "_get_session", return_value=mock_session):
        score = cat_detection.detect_cat(_jpeg_bytes())

    assert score is not None
    assert score == pytest.approx(0.9)
    get_settings.cache_clear()


def test_create_rejects_low_cat_score(client):
    from app.routers import sightings as sightings_router

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch.object(sightings_router.settings, "cat_detection_threshold", 0.99),
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


def test_create_stores_cat_confidence(client):
    from app.routers import sightings as sightings_router

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch.object(sightings_router.settings, "cat_detection_threshold", 0.01),
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
