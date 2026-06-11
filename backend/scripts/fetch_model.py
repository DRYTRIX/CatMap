#!/usr/bin/env python3
"""Download the COCO SSD ONNX model used for cat detection."""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

# Hugging Face mirror — detects COCO "cat" objects (better than breed classifiers).
MODEL_URL = (
    "https://huggingface.co/onnxmodelzoo/ssd_mobilenet_v1_12/resolve/main/"
    "ssd_mobilenet_v1_12.onnx"
)
OUTPUT = (
    Path(__file__).resolve().parent.parent / "models" / "ssd_mobilenet_v1_12.onnx"
)
MIN_BYTES = 20_000_000  # Real model is ~29 MB; LFS pointers are tiny.


def is_valid_model(path: Path) -> bool:
    if not path.is_file():
        return False
    if path.stat().st_size < MIN_BYTES:
        return False
    with path.open("rb") as fh:
        header = fh.read(32)
    if header.startswith(b"version https://git-lfs"):
        return False
    return True


def main() -> int:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    if is_valid_model(OUTPUT):
        print(f"Model already present: {OUTPUT}")
        return 0

    if OUTPUT.is_file():
        print(f"Removing invalid model at {OUTPUT}", file=sys.stderr)
        OUTPUT.unlink()

    print(f"Downloading model to {OUTPUT} …")
    try:
        urllib.request.urlretrieve(MODEL_URL, OUTPUT)
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to download model: {exc}", file=sys.stderr)
        return 1

    if not is_valid_model(OUTPUT):
        print("Downloaded file failed validation (too small or Git LFS pointer).", file=sys.stderr)
        OUTPUT.unlink(missing_ok=True)
        return 1

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
