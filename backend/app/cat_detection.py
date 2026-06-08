"""Server-side cat detection using an ONNX ImageNet classifier."""

from __future__ import annotations

import io
import logging
from pathlib import Path

import numpy as np
from PIL import Image

from .config import get_settings

logger = logging.getLogger("catmap")

# ImageNet indices for domestic cat breeds (tabby through Egyptian cat).
CAT_CLASS_INDICES = (281, 282, 283, 284, 285)

# ImageNet normalization constants.
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

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


def _preprocess(image_bytes: bytes) -> np.ndarray | None:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = img.convert("RGB")
            img = img.resize((224, 224), Image.BILINEAR)
            arr = np.asarray(img, dtype=np.float32) / 255.0
    except Exception:  # noqa: BLE001
        logger.exception("Could not preprocess image for cat detection.")
        return None

    arr = (arr - _MEAN) / _STD
    # NCHW batch of 1.
    return np.transpose(arr, (2, 0, 1))[np.newaxis, ...]


def _softmax(logits: np.ndarray) -> np.ndarray:
    exp = np.exp(logits - np.max(logits))
    return exp / exp.sum()


def detect_cat(image_bytes: bytes) -> float | None:
    """Return max domestic-cat softmax score, or None if detection is unavailable."""
    settings = get_settings()
    if not settings.cat_detection_enabled:
        return None

    session = _get_session()
    if session is None:
        return None

    tensor = _preprocess(image_bytes)
    if tensor is None:
        return None

    try:
        input_name = session.get_inputs()[0].name
        outputs = session.run(None, {input_name: tensor})
        probs = _softmax(outputs[0][0])
        score = float(max(probs[i] for i in CAT_CLASS_INDICES))
        return score
    except Exception:  # noqa: BLE001
        logger.exception("Cat detection inference failed — upload allowed without scoring.")
        return None
