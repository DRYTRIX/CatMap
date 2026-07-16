"""Tests for model download fallback behavior."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import fetch_model  # noqa: E402


def test_download_model_falls_back_to_next_source(tmp_path, monkeypatch):
    output = tmp_path / "model.onnx"
    attempts: list[str] = []

    def fake_download_once(url: str, path: Path) -> None:
        attempts.append(url)
        if url == "primary":
            raise RuntimeError("primary failed")
        path.write_bytes(b"ok")

    monkeypatch.setattr(fetch_model, "_download_once", fake_download_once)
    monkeypatch.setattr(fetch_model, "is_valid_model", lambda path: path.exists() and path.read_bytes() == b"ok")
    monkeypatch.setattr(fetch_model.time, "sleep", lambda _: None)

    error = fetch_model.download_model([("primary", 2), ("secondary", 1)], output)

    assert error is None
    assert attempts == ["primary", "primary", "secondary"]


def test_download_model_limits_retries_per_source(tmp_path, monkeypatch):
    output = tmp_path / "model.onnx"
    attempts: list[str] = []

    def fake_download_once(url: str, path: Path) -> None:
        attempts.append(url)
        raise RuntimeError(f"{url} failed")

    monkeypatch.setattr(fetch_model, "_download_once", fake_download_once)
    monkeypatch.setattr(fetch_model.time, "sleep", lambda _: None)

    error = fetch_model.download_model([("first", 2), ("second", 1)], output)

    assert error == "second failed"
    assert attempts == ["first", "first", "second"]
