"""Outbound admin notifications (Telegram)."""

from __future__ import annotations

import html
import logging

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

_MAX_DESC = 200


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
