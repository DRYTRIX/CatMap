import re
import secrets

from fastapi import Depends, Header, HTTPException, Response
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db

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


def optional_device_token(x_device_token: str | None = Header(default=None)) -> str | None:
    """Return the device token when present and valid; otherwise None."""
    if x_device_token and _TOKEN_RE.match(x_device_token):
        return x_device_token
    return None


def writable_device_token(
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
) -> str:
    """Device token that is allowed to mutate data (not blocklisted)."""
    from .models import BlockedToken

    blocked = db.get(BlockedToken, token)
    if blocked is not None:
        raise HTTPException(status_code=403, detail="This device has been blocked.")
    return token


def no_cache(response: Response) -> None:
    """Mark a dynamic response uncacheable so deletes/edits propagate promptly."""
    response.headers["Cache-Control"] = "no-cache"


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """Gate admin routes behind the ADMIN_TOKEN env var (constant-time compare)."""
    configured = get_settings().admin_token
    if not configured:
        # Admin disabled when no token is configured.
        raise HTTPException(status_code=404, detail="Not found.")
    if not x_admin_token or not secrets.compare_digest(x_admin_token, configured):
        raise HTTPException(status_code=401, detail="Invalid admin token.")
