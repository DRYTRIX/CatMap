"""Server-side cat detection using a COCO SSD object detector."""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image

from .config import get_settings

logger = logging.getLogger("catmap")

# TensorFlow object-detection API label id for COCO "cat" (1-based).
COCO_CAT_CLASS_ID = 17

_session = None
_session_failed = False

DetectionStatus = Literal["disabled", "ready", "unavailable"]


def _model_path() -> Path:
    settings = get_settings()
    path = Path(settings.cat_detection_model_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path
    return path


def _get_session():
    global _session, _session_failed  # noqa: PLW0603

    if _session_failed:
        return None
    if _session is not None:
        return _session

    path = _model_path()
    if not path.is_file():
        logger.warning(
            "Cat detection model not found at %s — detection unavailable.",
            path,
        )
        _session_failed = True
        return None

    try:
        import onnxruntime as ort

        _session = ort.InferenceSession(
            str(path),
            providers=["CPUExecutionProvider"],
        )
        return _session
    except Exception:  # noqa: BLE001
        logger.exception("Failed to load cat detection model — detection unavailable.")
        _session_failed = True
        return None


def get_detection_status() -> DetectionStatus:
    """Return whether cat detection is disabled, ready, or unavailable."""
    settings = get_settings()
    if not settings.cat_detection_enabled:
        return "disabled"
    if _get_session() is not None:
        return "ready"
    return "unavailable"


def _crops(img: Image.Image) -> list[Image.Image]:
    """Return full-frame and focused crops so small/off-center cats are found."""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return [
        img,
        img.crop((left, top, left + side, top + side)),
        img.crop((0, 0, w, max(h // 2, 1))),
        # Cats perched on fence posts often sit in the upper-left after JPEG resize.
        img.crop((0, 0, max(w // 2, 1), h)),
    ]


def _cat_score_for_image(session, img: Image.Image) -> float:
    input_name = session.get_inputs()[0].name
    arr = np.asarray(img.convert("RGB"), dtype=np.uint8)[np.newaxis, ...]
    outputs = session.run(None, {input_name: arr})
    classes = outputs[1]
    scores = outputs[2]
    num = int(outputs[3][0])

    best = 0.0
    for i in range(num):
        if int(classes[0][i]) == COCO_CAT_CLASS_ID:
            best = max(best, float(scores[0][i]))
    return best


def detect_cat(image_bytes: bytes) -> float | None:
    """Return best COCO cat detection score, or None if detection is unavailable."""
    settings = get_settings()
    if not settings.cat_detection_enabled:
        return None

    session = _get_session()
    if session is None:
        return None

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = img.convert("RGB")
            score = max(_cat_score_for_image(session, crop) for crop in _crops(img))
        return score
    except Exception:  # noqa: BLE001
        logger.exception("Cat detection inference failed.")
        return None
