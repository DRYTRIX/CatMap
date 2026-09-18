"""Account authentication and management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import auth_service
from ..config import get_settings
from ..database import get_db
from ..identity import Identity, require_user, writable_identity
from ..models import User
from ..ratelimit import limiter
from ..schemas import AuthSessionOut, EmailPrefsOut, MessageOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _reload_user(db: Session, user_id: str) -> User:
    return db.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.identities), selectinload(User.devices))
    ).scalar_one()


def _user_out(
    user: User,
    *,
    device_claimed: bool = True,
    device_claim_reason: str | None = None,
) -> UserOut:
    data = auth_service.user_out(
        user,
        device_claimed=device_claimed,
        device_claim_reason=device_claim_reason,
    )
    return UserOut(**data)


def _session_out(
    user: User,
    session_token: str,
    *,
    device_claimed: bool,
    device_claim_reason: str | None,
) -> AuthSessionOut:
    return AuthSessionOut(
        session_token=session_token,
        user=_user_out(
            user,
            device_claimed=device_claimed,
            device_claim_reason=device_claim_reason,
        ),
    )


@router.post("/signup", response_model=AuthSessionOut, status_code=201)
@limiter.limit(settings.rate_limit_auth)
def signup(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    name: str | None = Form(None),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> AuthSessionOut:
    user, session_token, claimed, reason = auth_service.signup(
        db,
        email=email,
        password=password,
        name=name,
        device_token=ident.device_token,
    )
    user = _reload_user(db, user.id)
    return _session_out(
        user, session_token, device_claimed=claimed, device_claim_reason=reason
    )


@router.post("/login", response_model=AuthSessionOut)
@limiter.limit(settings.rate_limit_auth)
def login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> AuthSessionOut:
    user, session_token, claimed, reason = auth_service.login(
        db,
        email=email,
        password=password,
        device_token=ident.device_token,
    )
    user = _reload_user(db, user.id)
    return _session_out(
        user, session_token, device_claimed=claimed, device_claim_reason=reason
    )


@router.post("/google", response_model=AuthSessionOut)
@limiter.limit(settings.rate_limit_auth)
def login_google(
    request: Request,
    id_token: str = Form(...),
    ident: Identity = Depends(writable_identity),
    db: Session = Depends(get_db),
) -> AuthSessionOut:
    user, session_token, claimed, reason = auth_service.login_google(
        db,
        id_token_raw=id_token,
        device_token=ident.device_token,
    )
    user = _reload_user(db, user.id)
    return _session_out(
        user, session_token, device_claimed=claimed, device_claim_reason=reason
    )


@router.post("/logout", response_model=MessageOut)
def logout(
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    auth_service.revoke_session(db, ident.session_id)
    db.commit()
    return MessageOut(ok=True)


@router.post("/logout-all", response_model=MessageOut)
def logout_all(
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    assert ident.user is not None
    auth_service.revoke_all_sessions(db, ident.user.id)
    db.commit()
    return MessageOut(ok=True)


@router.get("/me", response_model=UserOut)
def me(
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> UserOut:
    assert ident.user is not None
    user = _reload_user(db, ident.user.id)
    device_claimed = any(d.device_token == ident.device_token for d in user.devices)
    reason = None if device_claimed else "device_claimed_by_other"
    # If not claimed, check whether another user owns it.
    if not device_claimed:
        from ..models import UserDevice

        other = db.get(UserDevice, ident.device_token)
        if other is None:
            # Auto-claim on /me if free (e.g. signed in then cleared local link).
            claimed, reason = auth_service.claim_device(
                db, user=user, device_token=ident.device_token
            )
            db.commit()
            user = _reload_user(db, user.id)
            device_claimed = claimed
    return _user_out(user, device_claimed=device_claimed, device_claim_reason=reason)


@router.post("/verify-email", response_model=UserOut)
@limiter.limit(settings.rate_limit_auth)
def verify_email(
    request: Request,
    token: str = Form(...),
    db: Session = Depends(get_db),
) -> UserOut:
    user = auth_service.verify_email(db, raw_token=token)
    user = _reload_user(db, user.id)
    return _user_out(user)


@router.post("/resend-verification", response_model=MessageOut)
@limiter.limit(settings.rate_limit_auth)
def resend_verification(
    request: Request,
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    assert ident.user is not None
    auth_service.resend_verification(db, ident.user)
    return MessageOut(ok=True)


@router.post("/password/forgot", status_code=204)
@limiter.limit(settings.rate_limit_auth)
def forgot_password(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db),
) -> Response:
    auth_service.forgot_password(db, email=email)
    return Response(status_code=204)


@router.post("/password/reset", response_model=MessageOut)
@limiter.limit(settings.rate_limit_auth)
def reset_password(
    request: Request,
    token: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
) -> MessageOut:
    auth_service.reset_password(db, raw_token=token, password=password)
    return MessageOut(ok=True)


@router.post("/password/change", response_model=MessageOut)
def change_password(
    current_password: str | None = Form(None),
    new_password: str = Form(...),
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    assert ident.user is not None
    auth_service.change_password(
        db,
        ident.user,
        current_password=current_password,
        new_password=new_password,
    )
    return MessageOut(ok=True)


@router.post("/email/set-password", response_model=MessageOut)
def set_password(
    password: str = Form(...),
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    """Set a password on a Google-only account (no current password required)."""
    assert ident.user is not None
    if ident.user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="Password already set — use change password instead.",
        )
    auth_service.change_password(
        db,
        ident.user,
        current_password=None,
        new_password=password,
    )
    return MessageOut(ok=True)


@router.post("/google/unlink", response_model=UserOut)
def unlink_google(
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> UserOut:
    assert ident.user is not None
    user = _reload_user(db, ident.user.id)
    auth_service.unlink_google(db, user)
    user = _reload_user(db, user.id)
    return _user_out(user)


@router.patch("/email-prefs", response_model=EmailPrefsOut)
def patch_email_prefs(
    enabled: bool | None = Form(None),
    activity: bool | None = Form(None),
    following: bool | None = Form(None),
    nearby: bool | None = Form(None),
    moderation: bool | None = Form(None),
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> EmailPrefsOut:
    assert ident.user is not None
    user = auth_service.update_email_prefs(
        db,
        ident.user,
        enabled=enabled,
        activity=activity,
        following=following,
        nearby=nearby,
        moderation=moderation,
    )
    return EmailPrefsOut(
        enabled=user.email_enabled,
        activity=user.email_activity,
        following=user.email_following,
        nearby=user.email_nearby,
        moderation=user.email_moderation,
    )


@router.get("/email/unsubscribe", response_class=HTMLResponse)
def email_unsubscribe(
    token: str = Query(...),
    category: str | None = Query(None),
    db: Session = Depends(get_db),
) -> HTMLResponse:
    try:
        user = auth_service.unsubscribe(db, unsubscribe_token=token, category=category)
    except HTTPException:
        return HTMLResponse(
            "<!doctype html><html><body><h1>Link invalid</h1>"
            "<p>This unsubscribe link is not valid.</p></body></html>",
            status_code=404,
        )
    label = (category or "all").strip().lower() or "all"
    return HTMLResponse(
        "<!doctype html><html><body style='font-family:system-ui;padding:2rem'>"
        f"<h1>Unsubscribed</h1>"
        f"<p>Email notifications ({label}) are off for "
        f"<strong>{user.email}</strong>.</p>"
        "<p>You can change this anytime in CatMap Settings → Account.</p>"
        "</body></html>"
    )


@router.get("/export")
def export_account(
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    assert ident.user is not None
    user = _reload_user(db, ident.user.id)
    payload = auth_service.export_account(db, user)
    return JSONResponse(payload)


@router.delete("/account", response_model=MessageOut)
def delete_account(
    delete_content: bool = Form(False),
    ident: Identity = Depends(require_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    assert ident.user is not None
    user = _reload_user(db, ident.user.id)
    auth_service.delete_account(db, user, delete_content=delete_content)
    return MessageOut(ok=True)
