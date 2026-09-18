"""Account auth: signup, login, Google, sessions, device claiming."""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from .config import get_settings
from .email import (
    send_password_changed_email,
    send_password_reset_email,
    send_verification_email,
)
from .models import (
    Cat,
    Comment,
    EmailToken,
    Heart,
    Sighting,
    User,
    UserDevice,
    UserIdentity,
    UserSession,
)
from .security import (
    generate_token,
    hash_password,
    hash_token,
    needs_rehash,
    verify_password,
)

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LEN = 8
MAX_PASSWORD_LEN = 128
MAX_NAME_LEN = 100
PURPOSE_VERIFY = "verify"
PURPOSE_RESET = "reset"


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_email(email: str) -> str:
    value = normalize_email(email)
    if not value or len(value) > 320 or not EMAIL_RE.match(value):
        raise HTTPException(status_code=400, detail="Invalid email address.")
    return value


def validate_password(password: str) -> str:
    if not password or len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LEN} characters.",
        )
    if len(password) > MAX_PASSWORD_LEN:
        raise HTTPException(status_code=400, detail="Password is too long.")
    return password


def _session_ttl() -> timedelta:
    days = max(1, get_settings().session_ttl_days)
    return timedelta(days=days)


def issue_session(db: Session, user: User) -> str:
    raw = generate_token(32)
    now = datetime.now(UTC)
    row = UserSession(
        user_id=user.id,
        token_hash=hash_token(raw),
        created_at=now,
        last_used_at=now,
        expires_at=now + _session_ttl(),
    )
    db.add(row)
    user.last_login_at = now
    db.flush()
    return raw


def revoke_session(db: Session, session_id: str | None) -> None:
    if not session_id:
        return
    row = db.get(UserSession, session_id)
    if row and row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)


def revoke_all_sessions(db: Session, user_id: str) -> int:
    now = datetime.now(UTC)
    rows = db.execute(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
    ).scalars().all()
    for row in rows:
        row.revoked_at = now
    return len(rows)


def _create_email_token(db: Session, user_id: str, purpose: str, ttl: timedelta) -> str:
    raw = generate_token(32)
    now = datetime.now(UTC)
    db.add(
        EmailToken(
            user_id=user_id,
            purpose=purpose,
            token_hash=hash_token(raw),
            created_at=now,
            expires_at=now + ttl,
        )
    )
    db.flush()
    return raw


def _consume_email_token(db: Session, raw: str, purpose: str) -> User:
    row = db.execute(
        select(EmailToken).where(EmailToken.token_hash == hash_token(raw))
    ).scalar_one_or_none()
    if row is None or row.purpose != purpose or row.used_at is not None:
        raise HTTPException(status_code=400, detail="Invalid or expired token.")
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Invalid or expired token.")
    user = db.get(User, row.user_id)
    if user is None or user.blocked_at is not None:
        raise HTTPException(status_code=400, detail="Invalid or expired token.")
    row.used_at = datetime.now(UTC)
    return user


def dedupe_hearts_for_claim(db: Session, *, user_id: str, device_token: str) -> None:
    """Drop device hearts that duplicate an existing user heart, then stamp user_id."""
    device_hearts = db.execute(
        select(Heart).where(Heart.device_token == device_token)
    ).scalars().all()
    if not device_hearts:
        return

    existing = {
        (h.target_type, h.target_id)
        for h in db.execute(select(Heart).where(Heart.user_id == user_id)).scalars().all()
    }
    for heart in device_hearts:
        key = (heart.target_type, heart.target_id)
        if key in existing:
            # Recompute denormalized count after removing the redundant device heart.
            target_type, target_id = key
            db.delete(heart)
            _recompute_hearts_count(db, target_type, target_id)
        else:
            heart.user_id = user_id
            existing.add(key)


def _recompute_hearts_count(db: Session, target_type: str, target_id: str) -> None:
    count = len(
        db.execute(
            select(Heart.id).where(
                Heart.target_type == target_type,
                Heart.target_id == target_id,
            )
        ).scalars().all()
    )
    if target_type == "sighting":
        row = db.get(Sighting, target_id)
        if row is not None:
            row.hearts_count = count
    elif target_type == "cat":
        row = db.get(Cat, target_id)
        if row is not None:
            row.hearts_count = count


def claim_device(
    db: Session,
    *,
    user: User,
    device_token: str,
) -> tuple[bool, str | None]:
    """Link device_token to user. Returns (claimed, reason_if_not)."""
    existing = db.get(UserDevice, device_token)
    if existing is not None:
        if existing.user_id == user.id:
            return True, None
        return False, "device_claimed_by_other"

    dedupe_hearts_for_claim(db, user_id=user.id, device_token=device_token)
    db.add(UserDevice(device_token=device_token, user_id=user.id))
    db.flush()
    return True, None


def user_out(
    user: User,
    *,
    device_claimed: bool = True,
    device_claim_reason: str | None = None,
) -> dict:
    providers = sorted({i.provider for i in (user.identities or [])})
    return {
        "id": user.id,
        "email": user.email,
        "email_verified": user.email_verified_at is not None,
        "name": user.name,
        "has_password": bool(user.password_hash),
        "providers": providers,
        "email_prefs": {
            "enabled": user.email_enabled,
            "activity": user.email_activity,
            "following": user.email_following,
            "nearby": user.email_nearby,
            "moderation": user.email_moderation,
        },
        "device_claimed": device_claimed,
        "device_claim_reason": device_claim_reason,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }


def signup(
    db: Session,
    *,
    email: str,
    password: str,
    name: str | None,
    device_token: str,
) -> tuple[User, str, bool, str | None]:
    email = validate_email(email)
    password = validate_password(password)
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    clean_name = (name or "").strip()[:MAX_NAME_LEN] or None
    user = User(
        email=email,
        password_hash=hash_password(password),
        name=clean_name,
    )
    db.add(user)
    db.flush()

    claimed, reason = claim_device(db, user=user, device_token=device_token)
    raw_session = issue_session(db, user)
    verify_raw = _create_email_token(db, user.id, PURPOSE_VERIFY, timedelta(hours=24))
    db.commit()
    db.refresh(user)

    try:
        send_verification_email(to=user.email, name=user.name, raw_token=verify_raw)
    except Exception:
        logger.exception("verification email failed")

    return user, raw_session, claimed, reason


def login(
    db: Session,
    *,
    email: str,
    password: str,
    device_token: str,
) -> tuple[User, str, bool, str | None]:
    email = validate_email(email)
    user = db.execute(
        select(User)
        .where(User.email == email)
        .options(selectinload(User.identities), selectinload(User.devices))
    ).scalar_one_or_none()
    if user is None or not user.password_hash or not verify_password(user.password_hash, password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if user.blocked_at is not None:
        raise HTTPException(status_code=403, detail="This account has been blocked.")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    claimed, reason = claim_device(db, user=user, device_token=device_token)
    raw_session = issue_session(db, user)
    db.commit()
    db.refresh(user)
    return user, raw_session, claimed, reason


def verify_google_id_token(raw_id_token: str) -> dict:
    settings = get_settings()
    audiences = settings.google_client_id_list
    if not audiences:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
    try:
        # google-auth accepts a single audience string; try each allowed client id.
        last_err: Exception | None = None
        for audience in audiences:
            try:
                return google_id_token.verify_oauth2_token(
                    raw_id_token,
                    google_requests.Request(),
                    audience,
                )
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                continue
        raise last_err or ValueError("invalid token")
    except Exception as exc:
        logger.info("google id token rejected: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Google token.") from exc


def login_google(
    db: Session,
    *,
    id_token_raw: str,
    device_token: str,
) -> tuple[User, str, bool, str | None]:
    claims = verify_google_id_token(id_token_raw)
    subject = claims.get("sub")
    email = normalize_email(claims.get("email") or "")
    email_verified = bool(claims.get("email_verified"))
    name = (claims.get("name") or "").strip()[:MAX_NAME_LEN] or None
    if not subject:
        raise HTTPException(status_code=401, detail="Invalid Google token.")

    identity = db.execute(
        select(UserIdentity).where(
            UserIdentity.provider == "google",
            UserIdentity.provider_subject == subject,
        )
    ).scalar_one_or_none()

    user: User | None = None
    if identity is not None:
        user = db.get(User, identity.user_id)
    elif email and email_verified:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user is not None:
            db.add(
                UserIdentity(
                    user_id=user.id,
                    provider="google",
                    provider_subject=subject,
                )
            )

    if user is None:
        if not email:
            raise HTTPException(
                status_code=400,
                detail="Google account did not provide an email address.",
            )
        user = User(
            email=email,
            email_verified_at=datetime.now(UTC) if email_verified else None,
            name=name,
            password_hash=None,
        )
        db.add(user)
        db.flush()
        db.add(
            UserIdentity(
                user_id=user.id,
                provider="google",
                provider_subject=subject,
            )
        )
    elif user.blocked_at is not None:
        raise HTTPException(status_code=403, detail="This account has been blocked.")
    else:
        if email_verified and user.email_verified_at is None and user.email == email:
            user.email_verified_at = datetime.now(UTC)
        if name and not user.name:
            user.name = name

    user = db.execute(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.identities), selectinload(User.devices))
    ).scalar_one()

    claimed, reason = claim_device(db, user=user, device_token=device_token)
    raw_session = issue_session(db, user)
    db.commit()
    db.refresh(user)
    return user, raw_session, claimed, reason


def verify_email(db: Session, *, raw_token: str) -> User:
    user = _consume_email_token(db, raw_token, PURPOSE_VERIFY)
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
    db.commit()
    db.refresh(user)
    return user


def resend_verification(db: Session, user: User) -> None:
    if user.email_verified_at is not None:
        return
    raw = _create_email_token(db, user.id, PURPOSE_VERIFY, timedelta(hours=24))
    db.commit()
    send_verification_email(to=user.email, name=user.name, raw_token=raw)


def forgot_password(db: Session, *, email: str) -> None:
    email = validate_email(email)
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    # Always succeed from the caller's perspective.
    if user is None or user.blocked_at is not None:
        return
    raw = _create_email_token(db, user.id, PURPOSE_RESET, timedelta(hours=1))
    db.commit()
    send_password_reset_email(to=user.email, name=user.name, raw_token=raw)


def reset_password(db: Session, *, raw_token: str, password: str) -> User:
    password = validate_password(password)
    user = _consume_email_token(db, raw_token, PURPOSE_RESET)
    user.password_hash = hash_password(password)
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
    revoke_all_sessions(db, user.id)
    db.commit()
    db.refresh(user)
    send_password_changed_email(to=user.email, name=user.name)
    return user


def change_password(
    db: Session,
    user: User,
    *,
    current_password: str | None,
    new_password: str,
) -> None:
    new_password = validate_password(new_password)
    if user.password_hash:
        if not current_password or not verify_password(user.password_hash, current_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
    user.password_hash = hash_password(new_password)
    db.commit()
    send_password_changed_email(to=user.email, name=user.name)


def unlink_google(db: Session, user: User) -> None:
    identities = [i for i in user.identities if i.provider == "google"]
    if not identities:
        raise HTTPException(status_code=400, detail="Google is not linked.")
    if not user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="Set a password before unlinking Google.",
        )
    for identity in identities:
        db.delete(identity)
    db.commit()


def update_email_prefs(
    db: Session,
    user: User,
    *,
    enabled: bool | None = None,
    activity: bool | None = None,
    following: bool | None = None,
    nearby: bool | None = None,
    moderation: bool | None = None,
) -> User:
    if enabled is not None:
        user.email_enabled = enabled
    if activity is not None:
        user.email_activity = activity
    if following is not None:
        user.email_following = following
    if nearby is not None:
        user.email_nearby = nearby
    if moderation is not None:
        user.email_moderation = moderation
    db.commit()
    db.refresh(user)
    return user


def unsubscribe(
    db: Session,
    *,
    unsubscribe_token: str,
    category: str | None,
) -> User:
    user = db.execute(
        select(User).where(User.unsubscribe_token == unsubscribe_token)
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Not found.")
    cat = (category or "").strip().lower()
    if cat in ("", "all", "enabled"):
        user.email_enabled = False
    elif cat == "activity":
        user.email_activity = False
    elif cat == "following":
        user.email_following = False
    elif cat == "nearby":
        user.email_nearby = False
    elif cat == "moderation":
        user.email_moderation = False
    else:
        raise HTTPException(status_code=400, detail="Unknown category.")
    db.commit()
    db.refresh(user)
    return user


def delete_account(
    db: Session,
    user: User,
    *,
    delete_content: bool = False,
) -> None:
    tokens = [d.device_token for d in user.devices]
    if delete_content and tokens:
        sightings = db.execute(
            select(Sighting).where(Sighting.creator_token.in_(tokens))
        ).scalars().all()
        for s in sightings:
            db.delete(s)
        cats = db.execute(select(Cat).where(Cat.creator_token.in_(tokens))).scalars().all()
        for c in cats:
            db.delete(c)
        comments = db.execute(
            select(Comment).where(Comment.device_token.in_(tokens))
        ).scalars().all()
        for c in comments:
            db.delete(c)
    # Hearts keep device_token but clear user_id via ON DELETE SET NULL;
    # devices/sessions/identities cascade from user delete.
    db.execute(delete(UserDevice).where(UserDevice.user_id == user.id))
    db.delete(user)
    db.commit()


def export_account(db: Session, user: User) -> dict:
    tokens = [d.device_token for d in user.devices]
    sightings = []
    cats = []
    comments = []
    hearts = []
    if tokens:
        sightings = [
            {
                "id": s.id,
                "lat": s.lat,
                "lng": s.lng,
                "description": s.description,
                "kind": s.kind,
                "status": s.status,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "cat_id": s.cat_id,
            }
            for s in db.execute(
                select(Sighting).where(Sighting.creator_token.in_(tokens))
            ).scalars().all()
        ]
        cats = [
            {
                "id": c.id,
                "name": c.name,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in db.execute(
                select(Cat).where(Cat.creator_token.in_(tokens))
            ).scalars().all()
        ]
        comments = [
            {
                "id": c.id,
                "sighting_id": c.sighting_id,
                "text": c.text,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in db.execute(
                select(Comment).where(Comment.device_token.in_(tokens))
            ).scalars().all()
        ]
    hearts = [
        {
            "target_type": h.target_type,
            "target_id": h.target_id,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in db.execute(select(Heart).where(Heart.user_id == user.id)).scalars().all()
    ]
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "user": {
            "id": user.id,
            "email": user.email,
            "email_verified": user.email_verified_at is not None,
            "name": user.name,
            "providers": sorted({i.provider for i in user.identities}),
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "device_tokens": tokens,
        "sightings": sightings,
        "cats": cats,
        "comments": comments,
        "hearts": hearts,
    }
