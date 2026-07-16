"""User notification inbox and push subscription management."""

from fastapi import APIRouter, Depends, Form, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import device_token, writable_device_token, no_cache
from ..models import Notification, PushSubscription
from ..schemas import NotificationOut, PushSubscribeResult, UnreadCountResult
from ..user_notifications import mark_notifications_read, unread_count

router = APIRouter(tags=["notifications"])
settings = get_settings()

ALLOWED_PLATFORMS = {"webpush", "fcm"}


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> list[NotificationOut]:
    stmt = (
        select(Notification)
        .where(Notification.recipient_token == token)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = db.execute(stmt).scalars().all()
    return [
        NotificationOut(
            id=n.id,
            type=n.type,
            sighting_id=n.sighting_id,
            comment_id=n.comment_id,
            payload_json=n.payload_json,
            created_at=n.created_at,
            read_at=n.read_at,
        )
        for n in rows
    ]


@router.get("/notifications/unread-count", response_model=UnreadCountResult)
def get_unread_count(
    token: str = Depends(device_token),
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> UnreadCountResult:
    return UnreadCountResult(count=unread_count(db, token))


@router.post("/notifications/read")
def read_notifications(
    ids: str = Form(""),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> dict:
    id_list = [s.strip() for s in ids.split(",") if s.strip()] if ids.strip() else None
    marked = mark_notifications_read(db, token, id_list)
    return {"marked": marked}


@router.get("/push/vapid-public-key")
def vapid_public_key() -> dict:
    key = settings.vapid_public_key
    if not key:
        raise HTTPException(status_code=404, detail="Web push not configured.")
    return {"public_key": key}


@router.post("/push/subscribe", response_model=PushSubscribeResult)
def subscribe_push(
    platform: str = Form(...),
    subscription: str = Form(...),
    alert_lat: float | None = Form(None),
    alert_lng: float | None = Form(None),
    alert_radius_km: float | None = Form(None),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> PushSubscribeResult:
    plat = platform.strip().lower()
    if plat not in ALLOWED_PLATFORMS:
        raise HTTPException(status_code=400, detail="Invalid platform.")

    sub_text = subscription.strip()
    if not sub_text:
        raise HTTPException(status_code=400, detail="Subscription required.")

    if (alert_lat is None) ^ (alert_lng is None):
        raise HTTPException(status_code=400, detail="Provide both alert_lat and alert_lng.")
    if alert_radius_km is not None and alert_radius_km <= 0:
        raise HTTPException(status_code=400, detail="alert_radius_km must be > 0.")

    existing = db.execute(
        select(PushSubscription).where(
            PushSubscription.device_token == token,
            PushSubscription.subscription == sub_text,
        )
    ).scalar_one_or_none()

    if existing:
        existing.platform = plat
        existing.alert_lat = alert_lat
        existing.alert_lng = alert_lng
        existing.alert_radius_km = alert_radius_km
        db.commit()
        return PushSubscribeResult(subscribed=True, id=existing.id)

    row = PushSubscription(
        device_token=token,
        platform=plat,
        subscription=sub_text,
        alert_lat=alert_lat,
        alert_lng=alert_lng,
        alert_radius_km=alert_radius_km,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return PushSubscribeResult(subscribed=True, id=row.id)


@router.delete("/push/subscribe")
def unsubscribe_push(
    subscription: str = Form(...),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> dict:
    sub_text = subscription.strip()
    row = db.execute(
        select(PushSubscription).where(
            PushSubscription.device_token == token,
            PushSubscription.subscription == sub_text,
        )
    ).scalar_one_or_none()
    if row:
        db.delete(row)
        db.commit()
    return {"removed": bool(row)}
