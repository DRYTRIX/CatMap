"""Server-side cat detection using YOLOv8 ONNX with multi-crop scanning."""

from __future__ import annotations

import io
import logging
from pathlib import Path

import numpy as np
from PIL import Image

from .config import get_settings

logger = logging.getLogger("catmap")

# COCO class index for "cat".
_COCO_CAT_CLASS = 15
_YOLO_INPUT_SIZE = 640
# Scan the full frame plus square crops at several scales (small cats in busy scenes).
_CROP_SCALES = (1.0, 0.5, 0.35, 0.25)
_CROP_GRID = 3
_EARLY_EXIT_SCORE = 0.5

_session = None
_session_failed = False


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
            "Cat detection model not found at %s — uploads allowed without scoring.",
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
        logger.exception("Failed to load cat detection model — uploads allowed without scoring.")
        _session_failed = True
        return None


def _preprocess_yolo(img: Image.Image) -> np.ndarray:
    resized = img.convert("RGB").resize(
        (_YOLO_INPUT_SIZE, _YOLO_INPUT_SIZE),
        Image.BILINEAR,
    )
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    return np.transpose(arr, (2, 0, 1))[np.newaxis, ...]


def _max_cat_score(session, img: Image.Image) -> float:
    input_name = session.get_inputs()[0].name
    tensor = _preprocess_yolo(img)
    output = session.run(None, {input_name: tensor})[0]
    preds = np.squeeze(output).T
    return float(np.max(preds[:, 4 + _COCO_CAT_CLASS]))


def _scan_image(img: Image.Image, session) -> float:
    w, h = img.size
    best = _max_cat_score(session, img)
    if best >= _EARLY_EXIT_SCORE:
        return best

    for scale in _CROP_SCALES:
        crop_size = max(64, int(min(w, h) * scale))
        max_x = max(0, w - crop_size)
        max_y = max(0, h - crop_size)
        for row in range(_CROP_GRID):
            for col in range(_CROP_GRID):
                left = int(max_x * col / (_CROP_GRID - 1)) if max_x > 0 else 0
                top = int(max_y * row / (_CROP_GRID - 1)) if max_y > 0 else 0
                crop = img.crop((left, top, left + crop_size, top + crop_size))
                best = max(best, _max_cat_score(session, crop))
                if best >= _EARLY_EXIT_SCORE:
                    return best
    return best


def detect_cat(image_bytes: bytes) -> float | None:
    """Return max cat detection score, or None if detection is unavailable."""
    settings = get_settings()
    if not settings.cat_detection_enabled:
        return None

    session = _get_session()
    if session is None:
        return None

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            return _scan_image(img, session)
    except Exception:  # noqa: BLE001
        logger.exception("Cat detection inference failed — upload allowed without scoring.")
        return None
