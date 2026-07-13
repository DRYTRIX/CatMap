"""Tests for Telegram sighting notifications."""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.config import get_settings
from app.notifications import build_sighting_notification, notify_startup, notify_telegram
from tests.conftest import create_sighting


@pytest.fixture
def telegram_env(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-bot-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "123456789")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_build_sighting_notification_active():
    text = build_sighting_notification(
        sighting_id="abc-123",
        lat=40.12345,
        lng=-3.67890,
        description="Orange tabby",
        cat_confidence=0.95,
        photo_count=2,
        pending=False,
        public_site_url="https://catmap.example.com",
    )
    assert "<b>New sighting</b>" in text
    assert "Needs approval" not in text
    assert "Orange tabby" in text
    assert "95%" in text
    assert "Photos: 2" in text
    assert 'href="https://catmap.example.com/s/abc-123"' in text
    assert "admin" not in text


def test_build_sighting_notification_pending():
    text = build_sighting_notification(
        sighting_id="abc-123",
        lat=40.0,
        lng=-3.0,
        description="Maybe a cat",
        cat_confidence=0.1,
        photo_count=1,
        pending=True,
        public_site_url="https://catmap.example.com",
    )
    assert "<b>Needs approval</b>" in text
    assert 'href="https://catmap.example.com/admin"' in text


def test_notify_telegram_noop_when_unconfigured(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
    get_settings.cache_clear()

    with patch("app.notifications.httpx.post") as post:
        notify_telegram("hello")
        post.assert_not_called()

    get_settings.cache_clear()


def test_notify_startup_sends_when_configured(telegram_env):
    mock_response = MagicMock()
    mock_response.status_code = 200

    with patch("app.notifications.httpx.post", return_value=mock_response) as post:
        notify_startup()

    post.assert_called_once()
    text = post.call_args.kwargs["json"]["text"]
    assert "started" in text
    assert "production" in text


def test_notify_telegram_sends_when_configured(telegram_env):
    mock_response = MagicMock()
    mock_response.status_code = 200

    with patch("app.notifications.httpx.post", return_value=mock_response) as post:
        notify_telegram("hello")

    post.assert_called_once()
    call_kwargs = post.call_args.kwargs
    assert call_kwargs["json"]["chat_id"] == "123456789"
    assert call_kwargs["json"]["text"] == "hello"
    assert call_kwargs["json"]["parse_mode"] == "HTML"


def test_notify_telegram_logs_http_failure(telegram_env):
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.text = "Bad Request"

    with patch("app.notifications.httpx.post", return_value=mock_response):
        notify_telegram("hello")


def test_notify_telegram_swallows_network_errors(telegram_env):
    with patch(
        "app.notifications.httpx.post",
        side_effect=httpx.ConnectError("offline"),
    ):
        notify_telegram("hello")


def test_create_sighting_triggers_telegram_notification(client, telegram_env):
    with patch("app.notifications.notify_telegram") as notify:
        res = create_sighting(client, "device-telegram", description="tabby cat")

    assert res.status_code == 201
    notify.assert_called_once()
    text = notify.call_args.args[0]
    assert "<b>New sighting</b>" in text
    assert "tabby cat" in text


def test_create_pending_sighting_sends_approval_notification(client, telegram_env):
    from app.cat_detection import DetectionResult
    from app.routers import sightings as sightings_router

    with (
        patch.object(sightings_router.settings, "cat_detection_enabled", True),
        patch.object(sightings_router.settings, "cat_detection_strict", True),
        patch.object(sightings_router.settings, "cat_detection_threshold", 0.99),
        patch("app.routers.sightings.get_detection_status", return_value="ready"),
        patch(
            "app.routers.sightings.detect_cat",
            return_value=DetectionResult(cat_score=0.1, animal_score=0.1),
        ),
        patch("app.notifications.notify_telegram") as notify,
    ):
        res = create_sighting(client, "device-pending", description="uncertain")

    assert res.status_code == 201
    assert res.json()["pending"] is True
    notify.assert_called_once()
    text = notify.call_args.args[0]
    assert "<b>Needs approval</b>" in text
    assert "/admin" in text


def test_create_sighting_skips_telegram_when_unconfigured(client, monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
    get_settings.cache_clear()

    with patch("app.notifications.httpx.post") as post:
        res = create_sighting(client, "device-no-telegram")

    assert res.status_code == 201
    post.assert_not_called()
    get_settings.cache_clear()
