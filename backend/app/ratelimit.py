"""Rate limiting keyed on signed-in user, then device token, then client IP."""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from .security import hash_token


def device_or_ip(request: Request) -> str:
    """Prefer user id (from Authorization), then device token, then IP.

    Looking up the session in the DB on every rate-limited request would be
    expensive, so we key on a stable prefix of the bearer token hash when
    present. Auth endpoints that issue sessions still fall back to device/IP.
    """
    auth = request.headers.get("Authorization") or ""
    parts = auth.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        # Stable per-session key without a DB round-trip.
        return f"ses:{hash_token(parts[1].strip())[:24]}"
    token = request.headers.get("X-Device-Token")
    if token:
        return f"tok:{token}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=device_or_ip)
