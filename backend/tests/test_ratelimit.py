from app.ratelimit import limiter
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
