#!/usr/bin/env python3
"""Download the YOLOv8n ONNX model used for cat detection."""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

# Ultralytics release asset (~13 MB).
MODEL_URL = (
    "https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8n.onnx"
)
OUTPUT = Path(__file__).resolve().parent.parent / "models" / "yolov8n.onnx"


def main() -> int:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.is_file():
        print(f"Model already present: {OUTPUT}")
        return 0

    print(f"Downloading model to {OUTPUT} …")
    try:
        urllib.request.urlretrieve(MODEL_URL, OUTPUT)
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to download model: {exc}", file=sys.stderr)
        return 1

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
