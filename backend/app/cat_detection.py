"""Server-side cat detection using a YOLOv10 COCO object detector."""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image, ImageOps

from .config import get_settings

logger = logging.getLogger("catmap")

# COCO class ids (0-based) in the YOLOv10 ONNX export.
COCO_CAT_CLASS_ID = 15
COCO_DOG_CLASS_ID = 16
YOLO_INPUT_SIZE = 640

_session = None
_session_failed = False

DetectionStatus = Literal["disabled", "ready", "unavailable"]


@dataclass(frozen=True)
class DetectionResult:
    """Best cat and animal (cat or dog) scores across multi-crop inference."""

    cat_score: float
    animal_score: float


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


def _letterbox(img: Image.Image, size: int = YOLO_INPUT_SIZE) -> np.ndarray:
    w, h = img.size
    scale = size / max(w, h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    resized = img.resize((nw, nh), Image.Resampling.BILINEAR)
    canvas = Image.new("RGB", (size, size), (114, 114, 114))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2))
    arr = np.asarray(canvas, dtype=np.float32) / 255.0
    return arr.transpose(2, 0, 1)[np.newaxis, ...]


def _scores_for_image(session, img: Image.Image) -> tuple[float, float]:
    input_name = session.get_inputs()[0].name
    arr = _letterbox(img)
    outputs = session.run(None, {input_name: arr})
    detections = outputs[0][0]  # [300, 6] -> x1, y1, x2, y2, score, class

    best_cat = 0.0
    best_dog = 0.0
    for row in detections:
        score = float(row[4])
        if score < 0.01:
            continue
        cls_id = int(row[5])
        if cls_id == COCO_CAT_CLASS_ID:
            best_cat = max(best_cat, score)
        elif cls_id == COCO_DOG_CLASS_ID:
            best_dog = max(best_dog, score)

    return best_cat, max(best_cat, best_dog)


def detect_cat(image_bytes: bytes) -> DetectionResult | None:
    """Return best cat/animal scores, or None if detection is unavailable."""
    settings = get_settings()
    if not settings.cat_detection_enabled:
        return None

    session = _get_session()
    if session is None:
        return None

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
            best_cat = 0.0
            best_animal = 0.0
            for crop in _crops(img):
                cat_score, animal_score = _scores_for_image(session, crop)
                best_cat = max(best_cat, cat_score)
                best_animal = max(best_animal, animal_score)
        return DetectionResult(cat_score=best_cat, animal_score=best_animal)
    except Exception:  # noqa: BLE001
        logger.exception("Cat detection inference failed.")
        return None
