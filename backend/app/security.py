"""Password hashing and opaque token helpers."""

from __future__ import annotations

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _ph.check_needs_rehash(password_hash)
    except Exception:
        return False


def generate_token(nbytes: int = 32) -> str:
    """URL-safe random token (returned in full to the client once)."""
    return secrets.token_urlsafe(nbytes)


def hash_token(raw: str) -> str:
    """SHA-256 hex digest for storing opaque tokens at rest."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
