"""Outbound email via Resend. No-op when RESEND_API_KEY is unset."""

from __future__ import annotations

import logging
from html import escape
from urllib.parse import quote

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"


def send_email(
    *,
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
    list_unsubscribe_url: str | None = None,
) -> bool:
    """Send an email. Returns True on success, False on skip/failure."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.debug("email skipped (RESEND_API_KEY unset): to=%s subject=%s", to, subject)
        return False
    if not to:
        return False

    payload: dict = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "text": text,
    }
    if html:
        payload["html"] = html
    if settings.email_reply_to:
        payload["reply_to"] = settings.email_reply_to
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }
    if list_unsubscribe_url:
        payload["headers"] = {
            "List-Unsubscribe": f"<{list_unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(RESEND_URL, json=payload, headers=headers)
        if resp.status_code >= 400:
            logger.warning(
                "resend failed status=%s body=%s",
                resp.status_code,
                resp.text[:300],
            )
            return False
        return True
    except Exception:
        logger.exception("resend request failed")
        return False


def _site_url() -> str:
    return get_settings().public_site_url.rstrip("/")


def unsubscribe_url(unsubscribe_token: str, category: str | None = None) -> str:
    base = f"{_site_url()}/api/auth/email/unsubscribe?token={quote(unsubscribe_token)}"
    if category:
        return f"{base}&category={quote(category)}"
    return base


def _wrap_html(body: str, unsub: str | None = None) -> str:
    footer = ""
    if unsub:
        footer = (
            f'<p style="color:#666;font-size:12px;margin-top:24px">'
            f'<a href="{escape(unsub)}">Unsubscribe</a> from these emails.</p>'
        )
    return (
        '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;'
        'padding:24px;color:#222">'
        f"{body}{footer}</div>"
    )


def send_verification_email(*, to: str, name: str | None, raw_token: str) -> bool:
    link = f"{_site_url()}/?verify={quote(raw_token)}"
    greeting = f"Hi {name}," if name else "Hi,"
    text = (
        f"{greeting}\n\n"
        "Confirm your CatMap email address by opening this link:\n"
        f"{link}\n\n"
        "If you did not create an account, you can ignore this message.\n"
    )
    html = _wrap_html(
        f"<p>{escape(greeting)}</p>"
        "<p>Confirm your CatMap email address:</p>"
        f'<p><a href="{escape(link)}">Verify email</a></p>'
        "<p>If you did not create an account, you can ignore this message.</p>"
    )
    return send_email(to=to, subject="Verify your CatMap email", text=text, html=html)


def send_password_reset_email(*, to: str, name: str | None, raw_token: str) -> bool:
    link = f"{_site_url()}/?reset={quote(raw_token)}"
    greeting = f"Hi {name}," if name else "Hi,"
    text = (
        f"{greeting}\n\n"
        "Reset your CatMap password with this link (expires in 1 hour):\n"
        f"{link}\n\n"
        "If you did not request a reset, you can ignore this message.\n"
    )
    html = _wrap_html(
        f"<p>{escape(greeting)}</p>"
        "<p>Reset your CatMap password (link expires in 1 hour):</p>"
        f'<p><a href="{escape(link)}">Reset password</a></p>'
        "<p>If you did not request a reset, you can ignore this message.</p>"
    )
    return send_email(to=to, subject="Reset your CatMap password", text=text, html=html)


def send_password_changed_email(*, to: str, name: str | None) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    text = (
        f"{greeting}\n\n"
        "Your CatMap password was changed. If this wasn't you, reset it "
        "immediately from the app and contact support.\n"
    )
    html = _wrap_html(
        f"<p>{escape(greeting)}</p>"
        "<p>Your CatMap password was changed. If this wasn't you, reset it "
        "immediately from the app and contact support.</p>"
    )
    return send_email(to=to, subject="Your CatMap password was changed", text=text, html=html)


def send_notification_email(
    *,
    to: str,
    name: str | None,
    title: str,
    body: str,
    url: str | None,
    unsubscribe_token: str,
    category: str,
) -> bool:
    site = _site_url()
    link = f"{site}{url}" if url and url.startswith("/") else (url or site)
    unsub = unsubscribe_url(unsubscribe_token, category)
    greeting = f"Hi {name}," if name else "Hi,"
    text = (
        f"{greeting}\n\n"
        f"{title}\n"
        f"{body}\n\n"
        f"Open: {link}\n\n"
        f"Unsubscribe: {unsub}\n"
    )
    html = _wrap_html(
        f"<p>{escape(greeting)}</p>"
        f"<p><strong>{escape(title)}</strong></p>"
        f"<p>{escape(body)}</p>"
        f'<p><a href="{escape(link)}">Open in CatMap</a></p>',
        unsub=unsub,
    )
    return send_email(
        to=to,
        subject=title,
        text=text,
        html=html,
        list_unsubscribe_url=unsub,
    )
