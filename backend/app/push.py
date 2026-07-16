"""Web Push (VAPID) and FCM delivery."""

from __future__ import annotations

import json
import logging

import httpx

from .config import get_settings
from .database import SessionLocal
from .models import PushSubscription

logger = logging.getLogger(__name__)


def send_push_to_token(
    sub: PushSubscription,
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
    sub: PushSubscription,
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
    try:
        webpush(
            subscription_info=json.loads(sub.subscription),
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            _delete_subscription(sub.id)
        logger.warning("webpush failed status=%s", status)
    except Exception:
        logger.exception("webpush error")


def _send_fcm(
    sub: PushSubscription,
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
    try:
        resp = httpx.post(
            f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send",
            headers={"Authorization": f"Bearer {token}"},
            json=message,
            timeout=10.0,
        )
        if resp.status_code in (404, 410):
            _delete_subscription(sub.id)
        elif resp.status_code >= 400:
            logger.warning("FCM send failed: %s %s", resp.status_code, resp.text[:300])
    except Exception:
        logger.exception("FCM send error")


def _fcm_access_token(service_account_json: str) -> str:
    from google.oauth2 import service_account
    import google.auth.transport.requests

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
