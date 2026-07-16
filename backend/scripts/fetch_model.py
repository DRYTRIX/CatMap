#!/usr/bin/env python3
"""Download the YOLOv10s ONNX model used for cat detection."""

from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx

# Hugging Face mirror — YOLOv10s COCO detector (cat class id 15).
MODEL_URLS = [
    "https://huggingface.co/onnx-community/yolov10s/resolve/main/onnx/model.onnx",
    "https://hf-mirror.com/onnx-community/yolov10s/resolve/main/onnx/model.onnx",
    "https://github.com/THU-MIG/yolov10/releases/download/v1.1/yolov10s.onnx",
]
OUTPUT = Path(__file__).resolve().parent.parent / "models" / "yolov10s.onnx"
MIN_BYTES = 10_000_000  # Real model is ~29 MB; LFS pointers are tiny.
MAX_ATTEMPTS = 5
TIMEOUT = httpx.Timeout(30.0, read=300.0)


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


def _download_once(url: str, output: Path) -> None:
    output.unlink(missing_ok=True)
    with httpx.stream("GET", url, timeout=TIMEOUT, follow_redirects=True) as response:
        response.raise_for_status()
        with output.open("wb") as fh:
            for chunk in response.iter_bytes():
                fh.write(chunk)


def download_model(urls: list[str], output: Path) -> str | None:
    """Try each URL with retries. Returns error message on failure, else None."""
    last_error: str | None = None

    for url in urls:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                print(f"Downloading from {url} (attempt {attempt}/{MAX_ATTEMPTS}) …")
                _download_once(url, output)
                if is_valid_model(output):
                    return None
                output.unlink(missing_ok=True)
                last_error = "Downloaded file failed validation (too small or Git LFS pointer)."
            except Exception as exc:  # noqa: BLE001
                output.unlink(missing_ok=True)
                last_error = str(exc)
                print(f"Attempt {attempt} failed: {exc}", file=sys.stderr)

            if attempt < MAX_ATTEMPTS:
                delay = 2 ** attempt
                print(f"Retrying in {delay}s …", file=sys.stderr)
                time.sleep(delay)

    return last_error


def main() -> int:
    output = OUTPUT
    output.parent.mkdir(parents=True, exist_ok=True)

    if is_valid_model(output):
        print(f"Model already present: {output}")
        return 0

    if output.is_file():
        print(f"Removing invalid model at {output}", file=sys.stderr)
        output.unlink()

    print(f"Downloading model to {output} …")
    error = download_model(MODEL_URLS, output)
    if error is not None:
        print(f"Failed to download model: {error}", file=sys.stderr)
        return 1

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
