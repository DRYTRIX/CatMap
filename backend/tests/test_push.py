"""Tests for Web Push / FCM delivery helpers and admin test endpoint."""

from unittest.mock import MagicMock, patch

import pytest

from app.config import get_settings
from app.models import PushSubscription
from app.push import _PushTarget, send_push_to_token, submit_push

ADMIN = {"X-Admin-Token": "test-admin"}
DEVICE = {"X-Device-Token": "device-push-test-aaaaaaaa"}


@pytest.fixture
def vapid_env(monkeypatch):
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "BFakePublicKeyForTestsOnly")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "FakePrivateKeyForTestsOnly")
    monkeypatch.setenv("VAPID_SUBJECT", "mailto:admin@catmap.drytrix.com")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_admin_push_test_requires_token(client):
    assert client.post("/api/admin/push/test", data={"device_token": "x"}).status_code == 401


def test_admin_push_test_queues_subscriptions(client):
    # Register a webpush subscription for the device.
    sub = client.post(
        "/api/push/subscribe",
        data={
            "platform": "webpush",
            "subscription": '{"endpoint":"https://example.com/push","keys":{"p256dh":"x","auth":"y"}}',
        },
        headers=DEVICE,
    )
    assert sub.status_code == 200

    with patch("app.routers.admin.submit_push") as mocked:
        res = client.post(
            "/api/admin/push/test",
            data={
                "device_token": DEVICE["X-Device-Token"],
                "title": "Hello",
                "body": "World",
            },
            headers=ADMIN,
        )

    assert res.status_code == 200
    body = res.json()
    assert body["subscriptions_found"] == 1
    assert body["queued"] == 1
    mocked.assert_called_once()
    assert mocked.call_args.kwargs["title"] == "Hello"
    assert mocked.call_args.kwargs["body"] == "World"


def test_admin_push_test_zero_when_no_subs(client):
    res = client.post(
        "/api/admin/push/test",
        data={"device_token": "unknown-device-token"},
        headers=ADMIN,
    )
    assert res.status_code == 200
    assert res.json() == {"subscriptions_found": 0, "queued": 0}


def test_send_webpush_retries_on_transient_error(vapid_env):
    target = _PushTarget(
        id="sub-1",
        platform="webpush",
        subscription='{"endpoint":"https://example.com/push","keys":{"p256dh":"x","auth":"y"}}',
    )

    from pywebpush import WebPushException

    response_500 = MagicMock()
    response_500.status_code = 500
    fail = WebPushException("server error", response=response_500)

    with (
        patch("app.push.time.sleep"),
        patch("pywebpush.webpush", side_effect=[fail, fail, None]) as webpush,
    ):
        send_push_to_token(target, title="t", body="b", url="/")

    assert webpush.call_count == 3


def test_send_webpush_deletes_on_gone(vapid_env):
    target = _PushTarget(
        id="sub-gone",
        platform="webpush",
        subscription='{"endpoint":"https://example.com/push","keys":{"p256dh":"x","auth":"y"}}',
    )

    from pywebpush import WebPushException

    response_410 = MagicMock()
    response_410.status_code = 410
    gone = WebPushException("gone", response=response_410)

    with (
        patch("pywebpush.webpush", side_effect=gone),
        patch("app.push._delete_subscription") as delete,
    ):
        send_push_to_token(target, title="t", body="b")

    delete.assert_called_once_with("sub-gone")


def test_submit_push_nonblocking(vapid_env):
    sub = MagicMock(spec=PushSubscription)
    sub.id = "id-1"
    sub.platform = "webpush"
    sub.subscription = '{"endpoint":"https://example.com/x"}'

    with patch("app.push._push_pool.submit") as pool_submit:
        submit_push(sub, title="t", body="b", url="/")

    pool_submit.assert_called_once()
    args, kwargs = pool_submit.call_args
    assert args[0] is send_push_to_token
    assert isinstance(args[1], _PushTarget)
    assert args[1].id == "id-1"
    assert kwargs["title"] == "t"
