"""Request identity: anonymous device token, optionally linked to a user account."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .database import get_db
from .deps import device_token, optional_device_token
from .models import BlockedToken, User, UserDevice, UserSession
from .security import hash_token


@dataclass(frozen=True)
class Identity:
    """Resolved caller identity for a request.

    Anonymous callers have ``user is None`` and ``tokens == {device_token}``.
    Signed-in callers include every device token linked to their account, so
    ownership / inbox queries use ``.in_(identity.tokens)``.
    """

    device_token: str
    user: User | None
    tokens: frozenset[str]
    session_id: str | None = None

    @property
    def user_id(self) -> str | None:
        return self.user.id if self.user else None

    @property
    def rate_key(self) -> str:
        return f"usr:{self.user.id}" if self.user else f"tok:{self.device_token}"

    def owns_token(self, token: str | None) -> bool:
        return bool(token and token in self.tokens)


def _parse_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def _load_session_user(db: Session, raw_session: str) -> tuple[User, UserSession] | None:
    row = db.execute(
        select(UserSession)
        .where(UserSession.token_hash == hash_token(raw_session))
        .options(
            selectinload(UserSession.user).selectinload(User.devices),
            selectinload(UserSession.user).selectinload(User.identities),
        )
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        return None
    if row.user is None or row.user.blocked_at is not None:
        return None
    row.last_used_at = datetime.now(UTC)
    return row.user, row


def _tokens_for_user(user: User, device_token: str) -> frozenset[str]:
    linked = {d.device_token for d in user.devices}
    linked.add(device_token)
    return frozenset(linked)


def resolve_identity(
    db: Session,
    *,
    device: str,
    authorization: str | None,
) -> Identity:
    raw = _parse_bearer(authorization)
    if raw:
        loaded = _load_session_user(db, raw)
        if loaded is None:
            raise HTTPException(status_code=401, detail="Invalid or expired session.")
        user, session = loaded
        return Identity(
            device_token=device,
            user=user,
            tokens=_tokens_for_user(user, device),
            session_id=session.id,
        )
    return Identity(device_token=device, user=None, tokens=frozenset({device}))


def identity(
    device: str = Depends(device_token),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Identity:
    """Require a device token; attach account if a valid Bearer session is present."""
    return resolve_identity(db, device=device, authorization=authorization)


def optional_identity(
    device: str | None = Depends(optional_device_token),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Identity | None:
    """Return identity when a device token is present; otherwise None."""
    if not device:
        return None
    return resolve_identity(db, device=device, authorization=authorization)


def writable_identity(
    ident: Identity = Depends(identity),
    db: Session = Depends(get_db),
) -> Identity:
    """Identity allowed to mutate data (not blocked as a user or device)."""
    if ident.user is not None and ident.user.blocked_at is not None:
        raise HTTPException(status_code=403, detail="This account has been blocked.")
    blocked = db.execute(
        select(BlockedToken.token).where(BlockedToken.token.in_(ident.tokens))
    ).scalars().all()
    if blocked:
        raise HTTPException(status_code=403, detail="This device has been blocked.")
    return ident


def require_user(ident: Identity = Depends(writable_identity)) -> Identity:
    """Require a signed-in account (plus a writable device token)."""
    if ident.user is None:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return ident


def device_tokens_for_user(db: Session, user_id: str) -> list[str]:
    return list(
        db.execute(
            select(UserDevice.device_token).where(UserDevice.user_id == user_id)
        ).scalars().all()
    )


def user_for_device_token(db: Session, token: str) -> User | None:
    row = db.execute(
        select(UserDevice).where(UserDevice.device_token == token)
    ).scalar_one_or_none()
    if row is None:
        return None
    return db.get(User, row.user_id)
