"""Rate limiting keyed on the anonymous device token, falling back to client IP."""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def device_or_ip(request: Request) -> str:
    token = request.headers.get("X-Device-Token")
    if token:
        return f"tok:{token}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=device_or_ip)
