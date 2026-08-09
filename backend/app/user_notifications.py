"""In-app user notifications and push dispatch triggers."""

from __future__ import annotations

import json
import logging
import math
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import Comment, Confirmation, Notification, PushSubscription, Sighting
from .push import submit_push

logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6371.0

_NEARBY_COPY = {
    "missing": ("Missing cat near you", "A cat was reported missing nearby."),
    "sighting": ("Cat sighted near you", "Someone spotted a cat nearby."),
}


def _session() -> Session:
    return SessionLocal()


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    rlat1, rlng1, rlat2, rlng2 = map(math.radians, (lat1, lng1, lat2, lng2))
    dlat = rlat2 - rlat1
    dlng = rlng2 - rlng1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _engaged_tokens(
    db: Session,
    *,
    sighting_id: str,
    exclude: str | None = None,
) -> set[str]:
    """Devices that commented on or confirmed a sighting (excluding one token)."""
    recipients: set[str] = set()
    for token in db.scalars(
        select(Comment.device_token)
        .where(Comment.sighting_id == sighting_id, Comment.status == "visible")
        .distinct()
    ).all():
        if token:
            recipients.add(token)
    for token in db.scalars(
        select(Confirmation.device_token)
        .where(Confirmation.sighting_id == sighting_id)
        .distinct()
    ).all():
        if token:
            recipients.add(token)
    if exclude:
        recipients.discard(exclude)
    return recipients


def _create_notification(
    db: Session,
    *,
    recipient_token: str,
    ntype: str,
    sighting_id: str | None = None,
    comment_id: str | None = None,
    payload: dict | None = None,
) -> Notification:
    note = Notification(
        recipient_token=recipient_token,
        type=ntype,
        sighting_id=sighting_id,
        comment_id=comment_id,
        payload_json=json.dumps(payload or {}),
    )
    db.add(note)
    db.flush()
    return note


def _dispatch_push(recipient_token: str, title: str, body: str, url: str | None = None) -> None:
    db = _session()
    try:
        subs = db.execute(
            select(PushSubscription).where(PushSubscription.device_token == recipient_token)
        ).scalars().all()
        for sub in subs:
            submit_push(sub, title=title, body=body, url=url)
    except Exception:
        logger.exception("push dispatch failed for token prefix=%s", recipient_token[:8])
    finally:
        db.close()


def notify_inbox_and_push(
    *,
    recipient_token: str,
    ntype: str,
    title: str,
    body: str,
    sighting_id: str | None = None,
    comment_id: str | None = None,
    payload: dict | None = None,
    url: str | None = None,
) -> None:
    if not recipient_token:
        return
    db = _session()
    try:
        _create_notification(
            db,
            recipient_token=recipient_token,
            ntype=ntype,
            sighting_id=sighting_id,
            comment_id=comment_id,
            payload={"title": title, "body": body, **(payload or {})},
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("failed to create notification")
        return
    finally:
        db.close()
    _dispatch_push(recipient_token, title, body, url=url)


def notify_sighting_confirmed(*, sighting_id: str, creator_token: str) -> None:
    notify_inbox_and_push(
        recipient_token=creator_token,
        ntype="sighting_confirmed",
        title="Someone confirmed your sighting",
        body="Your cat sighting was just confirmed on CatMap.",
        sighting_id=sighting_id,
        url=f"/?s={sighting_id}",
    )


def notify_comment_posted(
    *,
    comment_id: str,
    sighting_id: str,
    author_token: str,
    sighting_creator_token: str,
) -> None:
    db = _session()
    try:
        sighting = db.get(Sighting, sighting_id)
        if sighting is None:
            return

        recipients: set[str] = set()
        if sighting_creator_token and sighting_creator_token != author_token:
            recipients.add(sighting_creator_token)

        prior = db.scalars(
            select(Comment.device_token)
            .where(
                Comment.sighting_id == sighting_id,
                Comment.id != comment_id,
                Comment.status == "visible",
            )
            .distinct()
        ).all()
        for token in prior:
            if token and token != author_token:
                recipients.add(token)

        title = (
            "New tip on a missing cat"
            if sighting.kind == "missing"
            else "New comment on your sighting"
        )
        body = "Someone left a tip — open CatMap to read it."

        for token in recipients:
            _create_notification(
                db,
                recipient_token=token,
                ntype="comment_posted",
                sighting_id=sighting_id,
                comment_id=comment_id,
                payload={"title": title, "body": body},
            )
        db.commit()

        for token in recipients:
            _dispatch_push(token, title, body, url=f"/?s={sighting_id}")
    except Exception:
        db.rollback()
        logger.exception("notify_comment_posted failed")
    finally:
        db.close()


def notify_sighting_moderated(
    *, sighting_id: str, creator_token: str, approved: bool
) -> None:
    if approved:
        title = "Your sighting was approved"
        body = "It's now live on the map."
        ntype = "sighting_approved"
    else:
        title = "Your sighting was hidden"
        body = "A moderator hid your post. Contact support if this was a mistake."
        ntype = "sighting_hidden"
    notify_inbox_and_push(
        recipient_token=creator_token,
        ntype=ntype,
        title=title,
        body=body,
        sighting_id=sighting_id,
        url=f"/?s={sighting_id}",
    )


def notify_photo_added(
    *,
    sighting_id: str,
    creator_token: str,
    contributor_token: str,
    photo_count: int,
) -> None:
    """Notify the sighting creator when someone else adds photos."""
    if not creator_token or creator_token == contributor_token:
        return
    count = max(1, photo_count)
    body = (
        f"{count} new photo{'s' if count != 1 else ''} were added to your sighting."
    )
    notify_inbox_and_push(
        recipient_token=creator_token,
        ntype="photo_added",
        title="New photo on your sighting",
        body=body,
        sighting_id=sighting_id,
        payload={"photo_count": count},
        url=f"/?s={sighting_id}",
    )


def notify_sighting_status_changed(
    *,
    sighting_id: str,
    actor_token: str,
    status: str,
) -> None:
    """Notify engaged devices when a sighting is marked found or gone."""
    if status == "found":
        title = "Missing cat marked as found"
        body = "Good news — the owner marked this missing cat as found."
        ntype = "sighting_found"
    elif status == "gone":
        title = "Sighting marked as gone"
        body = "The poster marked this cat as no longer there."
        ntype = "sighting_gone"
    else:
        return

    db = _session()
    try:
        recipients = _engaged_tokens(db, sighting_id=sighting_id, exclude=actor_token)
        for token in recipients:
            _create_notification(
                db,
                recipient_token=token,
                ntype=ntype,
                sighting_id=sighting_id,
                payload={"title": title, "body": body},
            )
        db.commit()
        for token in recipients:
            _dispatch_push(token, title, body, url=f"/?s={sighting_id}")
    except Exception:
        db.rollback()
        logger.exception("notify_sighting_status_changed failed")
    finally:
        db.close()


def notify_comment_hidden(*, comment_id: str, author_token: str, sighting_id: str) -> None:
    notify_inbox_and_push(
        recipient_token=author_token,
        ntype="comment_hidden",
        title="Your comment was hidden",
        body="Enough reports were filed — your comment is no longer visible.",
        sighting_id=sighting_id,
        comment_id=comment_id,
        url=f"/?s={sighting_id}",
    )


def notify_nearby_sighting(
    *,
    sighting_id: str,
    lat: float,
    lng: float,
    description: str,
    kind: str = "missing",
) -> None:
    """Alert geo-subscribed devices about a new nearby sighting of any kind."""
    db = _session()
    try:
        subs = db.execute(
            select(PushSubscription).where(
                PushSubscription.alert_radius_km.is_not(None),
                PushSubscription.alert_lat.is_not(None),
                PushSubscription.alert_lng.is_not(None),
            )
        ).scalars().all()

        title, default_body = _NEARBY_COPY.get(
            kind, ("Cat near you", "A cat was reported nearby.")
        )
        desc = (description or "").strip()[:120] or default_body
        ntype = "missing_nearby" if kind == "missing" else "sighting_nearby"

        for sub in subs:
            radius = sub.alert_radius_km or 0
            if radius <= 0:
                continue
            dist = _haversine_km(sub.alert_lat, sub.alert_lng, lat, lng)
            if dist > radius:
                continue
            if sub.device_token:
                _create_notification(
                    db,
                    recipient_token=sub.device_token,
                    ntype=ntype,
                    sighting_id=sighting_id,
                    payload={
                        "title": title,
                        "body": desc,
                        "distance_km": round(dist, 1),
                        "kind": kind,
                    },
                )
                submit_push(sub, title=title, body=desc, url=f"/?s={sighting_id}")

        db.commit()
    except Exception:
        db.rollback()
        logger.exception("notify_nearby_sighting failed")
    finally:
        db.close()


def notify_nearby_missing_cat(
    *, sighting_id: str, lat: float, lng: float, description: str
) -> None:
    """Backward-compatible alias for missing-cat nearby alerts."""
    notify_nearby_sighting(
        sighting_id=sighting_id,
        lat=lat,
        lng=lng,
        description=description,
        kind="missing",
    )


def mark_notifications_read(db: Session, token: str, ids: list[str] | None) -> int:
    now = datetime.now(UTC)
    stmt = select(Notification).where(
        Notification.recipient_token == token,
        Notification.read_at.is_(None),
    )
    if ids:
        stmt = stmt.where(Notification.id.in_(ids))
    rows = db.execute(stmt).scalars().all()
    for row in rows:
        row.read_at = now
    db.commit()
    return len(rows)


def unread_count(db: Session, token: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.recipient_token == token,
                Notification.read_at.is_(None),
            )
        )
        or 0
    )
