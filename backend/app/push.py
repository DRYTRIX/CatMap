"""Web Push (VAPID) and FCM delivery."""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import httpx

from .config import get_settings
from .database import SessionLocal
from .models import PushSubscription

logger = logging.getLogger(__name__)

_push_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="push")

_MAX_ATTEMPTS = 3
_BACKOFF_SECONDS = (1.0, 2.0)


@dataclass(frozen=True)
class _PushTarget:
    """Detached copy of the fields needed to deliver a push."""

    id: str
    platform: str
    subscription: str


def submit_push(
    sub: PushSubscription,
    *,
    title: str,
    body: str,
    url: str | None = None,
) -> None:
    """Queue a push for background delivery (non-blocking)."""
    # Snapshot fields — the caller's session may close before the worker runs.
    target = _PushTarget(id=sub.id, platform=sub.platform, subscription=sub.subscription)
    _push_pool.submit(
        send_push_to_token,
        target,
        title=title,
        body=body,
        url=url,
    )


def send_push_to_token(
    sub: PushSubscription | _PushTarget,
    *,
    title: str,
    body: str,
    url: str | None = None,
) -> None:
    if sub.platform == "webpush":
        _send_webpush(sub, title=title, body=body, url=url)
    elif sub.platform == "fcm":
        _send_fcm(sub, title=title, body=body, url=url)


def _send_webpush(
    sub: PushSubscription | _PushTarget,
    *,
    title: str,
    body: str,
    url: str | None,
) -> None:
    settings = get_settings()
    if not settings.vapid_private_key or not settings.vapid_public_key:
        return

    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush not installed — web push disabled")
        return

    payload = json.dumps({"title": title, "body": body, "url": url or "/"})
    for attempt in range(_MAX_ATTEMPTS):
        try:
            webpush(
                subscription_info=json.loads(sub.subscription),
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
            return
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                _delete_subscription(sub.id)
                logger.warning("webpush expired status=%s — subscription removed", status)
                return
            if status is not None and 400 <= status < 500:
                logger.warning("webpush failed status=%s (no retry)", status)
                return
            if attempt < _MAX_ATTEMPTS - 1:
                delay = _BACKOFF_SECONDS[min(attempt, len(_BACKOFF_SECONDS) - 1)]
                logger.warning(
                    "webpush transient failure status=%s attempt=%s — retry in %.0fs",
                    status,
                    attempt + 1,
                    delay,
                )
                time.sleep(delay)
                continue
            logger.warning("webpush failed status=%s after %s attempts", status, _MAX_ATTEMPTS)
        except Exception:
            if attempt < _MAX_ATTEMPTS - 1:
                delay = _BACKOFF_SECONDS[min(attempt, len(_BACKOFF_SECONDS) - 1)]
                logger.warning(
                    "webpush error attempt=%s — retry in %.0fs",
                    attempt + 1,
                    delay,
                    exc_info=True,
                )
                time.sleep(delay)
                continue
            logger.exception("webpush error after %s attempts", _MAX_ATTEMPTS)


def _send_fcm(
    sub: PushSubscription | _PushTarget,
    *,
    title: str,
    body: str,
    url: str | None,
) -> None:
    settings = get_settings()
    if not settings.fcm_service_account_json:
        return

    try:
        token = _fcm_access_token(settings.fcm_service_account_json)
        project_id = json.loads(settings.fcm_service_account_json)["project_id"]
    except Exception:
        logger.exception("FCM auth failed")
        return

    message = {
        "message": {
            "token": sub.subscription,
            "notification": {"title": title, "body": body},
            "data": {"url": url or "/"},
        }
    }
    url_endpoint = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    headers = {"Authorization": f"Bearer {token}"}

    for attempt in range(_MAX_ATTEMPTS):
        try:
            resp = httpx.post(
                url_endpoint,
                headers=headers,
                json=message,
                timeout=10.0,
            )
            if resp.status_code in (404, 410):
                _delete_subscription(sub.id)
                logger.warning(
                    "FCM token expired status=%s — subscription removed",
                    resp.status_code,
                )
                return
            if resp.status_code < 400:
                return
            if 400 <= resp.status_code < 500:
                logger.warning("FCM send failed: %s %s", resp.status_code, resp.text[:300])
                return
            if attempt < _MAX_ATTEMPTS - 1:
                delay = _BACKOFF_SECONDS[min(attempt, len(_BACKOFF_SECONDS) - 1)]
                logger.warning(
                    "FCM transient failure status=%s attempt=%s — retry in %.0fs",
                    resp.status_code,
                    attempt + 1,
                    delay,
                )
                time.sleep(delay)
                continue
            logger.warning(
                "FCM send failed after %s attempts: %s %s",
                _MAX_ATTEMPTS,
                resp.status_code,
                resp.text[:300],
            )
        except Exception:
            if attempt < _MAX_ATTEMPTS - 1:
                delay = _BACKOFF_SECONDS[min(attempt, len(_BACKOFF_SECONDS) - 1)]
                logger.warning(
                    "FCM send error attempt=%s — retry in %.0fs",
                    attempt + 1,
                    delay,
                    exc_info=True,
                )
                time.sleep(delay)
                continue
            logger.exception("FCM send error after %s attempts", _MAX_ATTEMPTS)


def _fcm_access_token(service_account_json: str) -> str:
    import google.auth.transport.requests
    from google.oauth2 import service_account

    info = json.loads(service_account_json)
    creds = service_account.Credentials.from_service_account_info(
        info,
        scopes=["https://www.googleapis.com/auth/firebase.messaging"],
    )
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token


def _delete_subscription(sub_id: str) -> None:
    db = SessionLocal()
    try:
        row = db.get(PushSubscription, sub_id)
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()
