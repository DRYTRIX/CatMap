import re
import secrets

from fastapi import Header, HTTPException

from .config import get_settings

# Device tokens are client-generated UUIDs; accept any reasonable opaque string.
_TOKEN_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def device_token(x_device_token: str | None = Header(default=None)) -> str:
    """Validate and return the anonymous device token from the request header."""
    if not x_device_token or not _TOKEN_RE.match(x_device_token):
        raise HTTPException(
            status_code=400,
            detail="Missing or invalid X-Device-Token header.",
        )
    return x_device_token


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """Gate admin routes behind the ADMIN_TOKEN env var (constant-time compare)."""
    configured = get_settings().admin_token
    if not configured:
        # Admin disabled when no token is configured.
        raise HTTPException(status_code=404, detail="Not found.")
    if not x_admin_token or not secrets.compare_digest(x_admin_token, configured):
        raise HTTPException(status_code=401, detail="Invalid admin token.")
