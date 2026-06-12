from starlette.requests import Request

from app.ratelimit import device_or_ip, limiter
from tests.conftest import create_sighting


def test_create_rate_limited(client):
    """RATE_LIMIT_CREATE is 5/minute in tests; the 6th create gets a 429."""
    limiter.enabled = True
    try:
        token = "ratelimited-device"
        statuses = [create_sighting(client, token).status_code for _ in range(6)]
        assert statuses[:5] == [201] * 5
        assert statuses[5] == 429
    finally:
        limiter.enabled = False
        limiter.reset()


def _request(headers: dict[str, str]) -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": ("203.0.113.5", 12345),
    }
    return Request(scope)


def test_device_or_ip_prefers_device_token():
    req = _request({"x-device-token": "abc123"})
    assert device_or_ip(req) == "tok:abc123"


def test_device_or_ip_falls_back_to_client_ip():
    req = _request({})
    assert device_or_ip(req) == "ip:203.0.113.5"
