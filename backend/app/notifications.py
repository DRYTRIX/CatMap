"""Outbound admin notifications (Telegram)."""

from __future__ import annotations

import html
import logging

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

_MAX_DESC = 200
_MAX_ISSUE_MSG = 1500


def _escape(text: str) -> str:
    return html.escape(text, quote=False)


def notify_telegram(text: str) -> None:
    """Send a Telegram message. No-op if not configured; logs on failure."""
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        response = httpx.post(
            url,
            json={
                "chat_id": settings.telegram_chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=10.0,
        )
        if response.status_code >= 400:
            logger.warning(
                "Telegram sendMessage failed: status=%s body=%s",
                response.status_code,
                response.text[:500],
            )
    except Exception:
        logger.exception("Telegram sendMessage error")


def build_sighting_notification(
    *,
    sighting_id: str,
    lat: float,
    lng: float,
    description: str,
    cat_confidence: float | None,
    photo_count: int,
    pending: bool,
    public_site_url: str,
) -> str:
    site = public_site_url.rstrip("/")
    sighting_url = f"{site}/s/{sighting_id}"
    maps_url = f"https://www.google.com/maps?q={lat},{lng}"
    admin_url = f"{site}/admin"

    desc = (description or "").strip()
    if len(desc) > _MAX_DESC:
        desc = desc[: _MAX_DESC - 1] + "…"
    if not desc:
        desc = "(no description)"

    conf_text = f"{cat_confidence:.0%}" if cat_confidence is not None else "n/a"

    lines: list[str] = []
    if pending:
        lines.append("<b>Needs approval</b>")
    else:
        lines.append("<b>New sighting</b>")

    lines.extend(
        [
            f"Description: {_escape(desc)}",
            f'Location: <a href="{_escape(maps_url)}">{lat:.5f}, {lng:.5f}</a>',
            f"Cat confidence: {_escape(conf_text)}",
            f"Photos: {photo_count}",
            f'<a href="{_escape(sighting_url)}">View sighting</a>',
        ]
    )

    if pending:
        lines.append(f'<a href="{_escape(admin_url)}">Open admin queue</a>')

    return "\n".join(lines)


def notify_startup() -> None:
    settings = get_settings()
    text = (
        "<b>CatMap backend started</b>\n"
        f"Environment: {_escape(settings.sentry_environment)}\n"
        f"Site: {_escape(settings.public_site_url)}"
    )
    notify_telegram(text)


def notify_sighting_created(
    *,
    sighting_id: str,
    lat: float,
    lng: float,
    description: str,
    cat_confidence: float | None,
    photo_count: int,
    pending: bool,
) -> None:
    settings = get_settings()
    text = build_sighting_notification(
        sighting_id=sighting_id,
        lat=lat,
        lng=lng,
        description=description,
        cat_confidence=cat_confidence,
        photo_count=photo_count,
        pending=pending,
        public_site_url=settings.public_site_url,
    )
    notify_telegram(text)


def build_issue_notification(
    *,
    issue_id: str,
    category: str,
    message: str,
    page_url: str | None,
    public_site_url: str,
) -> str:
    site = public_site_url.rstrip("/")
    admin_url = f"{site}/admin"

    msg = (message or "").strip()
    if len(msg) > _MAX_ISSUE_MSG:
        msg = msg[: _MAX_ISSUE_MSG - 1] + "…"
    if not msg:
        msg = "(no message)"

    title = "Bug report" if category == "bug" else "Issue report"
    lines = [
        f"<b>{title}</b>",
        f"Id: {_escape(issue_id)}",
        f"Category: {_escape(category)}",
        f"Message: {_escape(msg)}",
    ]
    if page_url:
        lines.append(f'Page: <a href="{_escape(page_url)}">{_escape(page_url)}</a>')
    lines.append(f'<a href="{_escape(admin_url)}">Open admin panel</a>')
    return "\n".join(lines)


def notify_issue_reported(
    *,
    issue_id: str,
    category: str,
    message: str,
    page_url: str | None,
) -> None:
    settings = get_settings()
    text = build_issue_notification(
        issue_id=issue_id,
        category=category,
        message=message,
        page_url=page_url,
        public_site_url=settings.public_site_url,
    )
    notify_telegram(text)


def notify_sighting_reported(
    *,
    sighting_id: str,
    reason: str,
    reports_count: int,
    hidden: bool,
) -> None:
    settings = get_settings()
    site = settings.public_site_url.rstrip("/")
    reason_text = (reason or "").strip() or "(unspecified)"
    lines = [
        "<b>Sighting reported</b>",
        f"Reason: {_escape(reason_text)}",
        f"Reports: {reports_count}",
        f'<a href="{_escape(f"{site}/s/{sighting_id}")}">View sighting</a>',
        f'<a href="{_escape(f"{site}/admin")}">Open admin panel</a>',
    ]
    if hidden:
        lines.insert(1, "Status: auto-hidden")
    notify_telegram("\n".join(lines))


def notify_comment_reported(
    *,
    sighting_id: str,
    comment_id: str,
    reports_count: int,
    hidden: bool,
) -> None:
    settings = get_settings()
    site = settings.public_site_url.rstrip("/")
    lines = [
        "<b>Comment reported</b>",
        f"Comment id: {_escape(comment_id)}",
        f"Reports: {reports_count}",
        f'<a href="{_escape(f"{site}/s/{sighting_id}")}">View sighting</a>',
        f'<a href="{_escape(f"{site}/admin")}">Open admin panel</a>',
    ]
    if hidden:
        lines.insert(1, "Status: auto-hidden")
    notify_telegram("\n".join(lines))
