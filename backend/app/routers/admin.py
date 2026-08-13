from collections import Counter
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Response
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import require_admin
from ..models import (
    AdminAction,
    BlockedToken,
    Cat,
    Comment,
    Confirmation,
    IssueReport,
    Photo,
    PushSubscription,
    Report,
    Sighting,
)
from ..push import submit_push
from ..schemas import (
    AdminActionRow,
    AdminCommentRow,
    AdminIssueRow,
    AdminMetrics,
    AdminReportRow,
    BlockedTokenRow,
    DatabaseTableUsage,
    DatabaseUsage,
    PhotoOut,
    SightingDetail,
)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


MAX_PAGE_SIZE = 200
METRICS_TREND_DAYS = 14
METRICS_ACTIONS_WINDOW_DAYS = 7


@router.get("/reports", response_model=list[AdminReportRow])
def list_reported(
    db: Session = Depends(get_db),
    sort: str = "reports",
    limit: int = 50,
    offset: int = 0,
) -> list[AdminReportRow]:
    """Sightings with at least one report, paginated.

    `sort` is "reports" (most-reported first, default) or "date" (newest first).
    """
    if sort not in ("reports", "date"):
        raise HTTPException(status_code=400, detail="sort must be 'reports' or 'date'.")
    if limit < 1 or limit > MAX_PAGE_SIZE:
        raise HTTPException(status_code=400, detail=f"limit must be 1-{MAX_PAGE_SIZE}.")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0.")

    order = (
        (Sighting.reports_count.desc(), Sighting.created_at.desc())
        if sort == "reports"
        else (Sighting.created_at.desc(),)
    )
    stmt = (
        select(Sighting)
        .where(Sighting.reports_count > 0)
        .order_by(*order)
        .limit(limit)
        .offset(offset)
    )
    rows = db.execute(stmt).scalars().all()
    return [
        AdminReportRow(
            id=s.id,
            lat=s.lat,
            lng=s.lng,
            description=s.description,
            status=s.status,
            reports_count=s.reports_count,
            confirmations_count=s.confirmations_count,
            cat_confidence=s.cat_confidence,
            created_at=s.created_at,
            # Public image routes 404 on hidden rows, so moderators use the
            # admin image routes below, which serve bytes regardless of status.
            thumbnail_url=f"/api/admin/sightings/{s.id}/thumbnail",
            creator_token=s.creator_token,
            kind=s.kind,
        )
        for s in rows
    ]


@router.get("/pending", response_model=list[AdminReportRow])
def list_pending(
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
) -> list[AdminReportRow]:
    """Sightings queued for review because cat detection was inconclusive."""
    if limit < 1 or limit > MAX_PAGE_SIZE:
        raise HTTPException(status_code=400, detail=f"limit must be 1-{MAX_PAGE_SIZE}.")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0.")

    stmt = (
        select(Sighting)
        .where(Sighting.status == "pending")
        .order_by(Sighting.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    rows = db.execute(stmt).scalars().all()
    return [
        AdminReportRow(
            id=s.id,
            lat=s.lat,
            lng=s.lng,
            description=s.description,
            status=s.status,
            reports_count=s.reports_count,
            confirmations_count=s.confirmations_count,
            cat_confidence=s.cat_confidence,
            created_at=s.created_at,
            thumbnail_url=f"/api/admin/sightings/{s.id}/thumbnail",
            creator_token=s.creator_token,
            kind=s.kind,
        )
        for s in rows
    ]


def _count(db: Session, *where) -> int:
    stmt = select(func.count()).select_from(Sighting)
    if where:
        stmt = stmt.where(*where)
    return int(db.scalar(stmt) or 0)


@router.get("/metrics", response_model=AdminMetrics)
def get_metrics(db: Session = Depends(get_db)) -> AdminMetrics:
    """Aggregate counts for the admin dashboard overview."""
    settings = get_settings()
    now = datetime.now(UTC)

    active_sightings = _count(db, Sighting.status == "active")
    stale_cutoff = now - timedelta(days=settings.stale_after_days)
    stale_sightings = (
        _count(
            db,
            Sighting.status == "active",
            Sighting.last_seen_at.is_not(None),
            Sighting.last_seen_at < stale_cutoff,
        )
        if settings.stale_after_days > 0
        else 0
    )

    avg_confidence = db.scalar(
        select(func.avg(Sighting.cat_confidence)).where(
            Sighting.cat_confidence.is_not(None)
        )
    )

    actions_cutoff = now - timedelta(days=METRICS_ACTIONS_WINDOW_DAYS)
    action_rows = db.execute(
        select(AdminAction.action, func.count())
        .where(AdminAction.created_at >= actions_cutoff)
        .group_by(AdminAction.action)
    ).all()

    trend_cutoff = now - timedelta(days=METRICS_TREND_DAYS)
    created_at_rows = db.scalars(
        select(Sighting.created_at).where(Sighting.created_at >= trend_cutoff)
    ).all()
    by_day = Counter(c.date() for c in created_at_rows)
    new_sightings_by_day = [
        {
            "date": day.isoformat(),
            "count": by_day.get(day, 0),
        }
        for day in (
            (now - timedelta(days=offset)).date()
            for offset in range(METRICS_TREND_DAYS - 1, -1, -1)
        )
    ]

    return AdminMetrics(
        total_sightings=_count(db),
        active_sightings=active_sightings,
        hidden_sightings=_count(db, Sighting.status == "hidden"),
        pending_sightings=_count(db, Sighting.status == "pending"),
        gone_sightings=_count(db, Sighting.status == "gone"),
        stale_sightings=stale_sightings,
        reported_sightings=_count(db, Sighting.reports_count > 0),
        total_reports=int(db.scalar(select(func.count()).select_from(Report)) or 0),
        total_confirmations=int(
            db.scalar(select(func.count()).select_from(Confirmation)) or 0
        ),
        extra_photos=int(db.scalar(select(func.count()).select_from(Photo)) or 0),
        avg_cat_confidence=float(avg_confidence) if avg_confidence is not None else None,
        actions_last_7d={action: count for action, count in action_rows},
        new_sightings_by_day=new_sightings_by_day,
    )


# Tables surfaced in the database-usage overview, in a fixed allowlist so the
# raw count query below never interpolates user input. The two image tables come
# first because their bytea blobs dominate storage.
_USAGE_TABLES = (
    "sightings",
    "photos",
    "confirmations",
    "reports",
    "admin_actions",
    "issue_reports",
)

# Blob columns per table, used as a best-effort size estimate on engines (e.g.
# SQLite in tests) that lack Postgres' pg_total_relation_size().
_TABLE_BLOB_COLUMNS = {
    "sightings": ("photo", "thumbnail"),
    "photos": ("photo", "thumbnail"),
}


def _table_size_bytes(db: Session, name: str) -> int:
    """Storage used by a table. Uses Postgres' relation size when available,
    otherwise sums the byte length of its blob columns (0 for metadata tables)."""
    if db.bind.dialect.name == "postgresql":
        return int(db.scalar(text("SELECT pg_total_relation_size(:t)").bindparams(t=name)) or 0)
    cols = _TABLE_BLOB_COLUMNS.get(name)
    if not cols:
        return 0
    sums = " + ".join(f"coalesce(sum(length({c})), 0)" for c in cols)
    return int(db.scalar(text(f"SELECT {sums} FROM {name}")) or 0)


@router.get("/database-usage", response_model=DatabaseUsage)
def get_database_usage(db: Session = Depends(get_db)) -> DatabaseUsage:
    """Storage footprint of the database for the admin dashboard.

    Photos are stored as blobs in the DB, so this shows how much space they use
    and how close the database is to its configured capacity.
    """
    settings = get_settings()

    tables = [
        DatabaseTableUsage(
            name=name,
            size_bytes=_table_size_bytes(db, name),
            row_count=int(db.scalar(text(f"SELECT count(*) FROM {name}")) or 0),
        )
        for name in _USAGE_TABLES
    ]
    tables.sort(key=lambda t: t.size_bytes, reverse=True)

    if db.bind.dialect.name == "postgresql":
        total = int(db.scalar(text("SELECT pg_database_size(current_database())")) or 0)
    else:
        total = sum(t.size_bytes for t in tables)

    image_storage = sum(t.size_bytes for t in tables if t.name in ("sightings", "photos"))
    avg_photo = db.scalar(select(func.avg(func.length(Sighting.photo))))
    avg_thumb = db.scalar(select(func.avg(func.length(Sighting.thumbnail))))
    capacity = settings.db_capacity_mb * 1024 * 1024 if settings.db_capacity_mb > 0 else None

    return DatabaseUsage(
        total_size_bytes=total,
        capacity_bytes=capacity,
        image_storage_bytes=image_storage,
        avg_photo_size_bytes=int(avg_photo) if avg_photo is not None else None,
        avg_thumbnail_size_bytes=int(avg_thumb) if avg_thumb is not None else None,
        tables=tables,
    )


def _get_or_404(db: Session, sighting_id: str) -> Sighting:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    return sighting


def _record_action(db: Session, action: str, sighting_id: str) -> None:
    db.add(AdminAction(action=action, sighting_id=sighting_id))


@router.get("/sightings/{sighting_id}/thumbnail")
def admin_thumbnail(sighting_id: str, db: Session = Depends(get_db)) -> Response:
    """Thumbnail bytes for moderation — served even when hidden/gone."""
    sighting = _get_or_404(db, sighting_id)
    return Response(content=sighting.thumbnail, media_type=sighting.photo_mime)


@router.get("/sightings/{sighting_id}/photo")
def admin_photo(sighting_id: str, db: Session = Depends(get_db)) -> Response:
    """Full image bytes for moderation — served even when hidden/gone."""
    sighting = _get_or_404(db, sighting_id)
    return Response(content=sighting.photo, media_type=sighting.photo_mime)


@router.post("/sightings/{sighting_id}/hide")
def hide(
    sighting_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    sighting = _get_or_404(db, sighting_id)
    creator = sighting.creator_token
    sighting.status = "hidden"
    _record_action(db, "hide", sighting.id)
    db.commit()
    if creator:
        from ..user_notifications import notify_sighting_moderated

        background_tasks.add_task(
            notify_sighting_moderated,
            sighting_id=sighting.id,
            creator_token=creator,
            approved=False,
        )
    return {"id": sighting.id, "status": sighting.status}


@router.post("/sightings/{sighting_id}/unhide")
def unhide(sighting_id: str, db: Session = Depends(get_db)) -> dict:
    sighting = _get_or_404(db, sighting_id)
    sighting.status = "active"
    _record_action(db, "unhide", sighting.id)
    db.commit()
    return {"id": sighting.id, "status": sighting.status}


@router.post("/sightings/{sighting_id}/approve")
def approve(
    sighting_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    sighting = _get_or_404(db, sighting_id)
    creator = sighting.creator_token
    sighting.status = "active"
    _record_action(db, "approve", sighting.id)
    db.commit()
    if creator:
        from ..user_notifications import notify_sighting_moderated

        background_tasks.add_task(
            notify_sighting_moderated,
            sighting_id=sighting.id,
            creator_token=creator,
            approved=True,
        )
    from ..user_notifications import notify_nearby_sighting

    background_tasks.add_task(
        notify_nearby_sighting,
        sighting_id=sighting.id,
        lat=sighting.lat,
        lng=sighting.lng,
        description=sighting.description,
        kind=sighting.kind,
    )
    return {"id": sighting.id, "status": sighting.status}


@router.delete("/sightings/{sighting_id}", status_code=204)
def admin_delete(sighting_id: str, db: Session = Depends(get_db)):
    sighting = _get_or_404(db, sighting_id)
    _record_action(db, "delete", sighting.id)
    db.delete(sighting)
    db.commit()


@router.delete("/cats/{cat_id}", status_code=204)
def admin_delete_cat(cat_id: str, db: Session = Depends(get_db)):
    """Delete a cat profile; linked sightings keep their data (cat_id cleared)."""
    cat = db.get(Cat, cat_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Cat profile not found.")
    _record_action(db, "delete_cat", cat.id)
    db.delete(cat)
    db.commit()


@router.get("/actions", response_model=list[AdminActionRow])
def list_actions(
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
) -> list[AdminActionRow]:
    """Recent moderation actions (hide/unhide/delete), newest first."""
    if limit < 1 or limit > MAX_PAGE_SIZE:
        raise HTTPException(status_code=400, detail=f"limit must be 1-{MAX_PAGE_SIZE}.")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0.")

    stmt = (
        select(AdminAction)
        .order_by(AdminAction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = db.execute(stmt).scalars().all()
    return [
        AdminActionRow(
            id=a.id,
            action=a.action,
            sighting_id=a.sighting_id,
            created_at=a.created_at,
        )
        for a in rows
    ]


@router.get("/issues", response_model=list[AdminIssueRow])
def list_issues(
    db: Session = Depends(get_db),
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AdminIssueRow]:
    """User-submitted app issue reports, newest first."""
    if status is not None and status not in ("open", "resolved"):
        raise HTTPException(status_code=400, detail="status must be 'open' or 'resolved'.")
    if limit < 1 or limit > MAX_PAGE_SIZE:
        raise HTTPException(status_code=400, detail=f"limit must be 1-{MAX_PAGE_SIZE}.")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0.")

    stmt = select(IssueReport).order_by(IssueReport.created_at.desc())
    if status is not None:
        stmt = stmt.where(IssueReport.status == status)
    stmt = stmt.limit(limit).offset(offset)
    rows = db.execute(stmt).scalars().all()
    return [
        AdminIssueRow(
            id=r.id,
            category=r.category,
            message=r.message,
            page_url=r.page_url,
            status=r.status,
            created_at=r.created_at,
        )
        for r in rows
    ]


def _get_issue_or_404(db: Session, issue_id: str) -> IssueReport:
    issue = db.get(IssueReport, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue report not found.")
    return issue


@router.post("/issues/{issue_id}/resolve")
def resolve_issue(issue_id: str, db: Session = Depends(get_db)) -> dict:
    issue = _get_issue_or_404(db, issue_id)
    issue.status = "resolved"
    db.commit()
    return {"id": issue.id, "status": issue.status}


@router.delete("/issues/{issue_id}", status_code=204)
def delete_issue(issue_id: str, db: Session = Depends(get_db)):
    issue = _get_issue_or_404(db, issue_id)
    db.delete(issue)
    db.commit()


def _admin_photos(s: Sighting) -> list[PhotoOut]:
    items = [
        PhotoOut(
            id="primary",
            position=0,
            photo_url=f"/api/admin/sightings/{s.id}/photo",
            thumbnail_url=f"/api/admin/sightings/{s.id}/thumbnail",
        )
    ]
    for p in s.photos:
        items.append(
            PhotoOut(
                id=p.id,
                position=p.position,
                photo_url=f"/api/admin/sightings/{s.id}/photos/{p.id}",
                thumbnail_url=f"/api/admin/sightings/{s.id}/photos/{p.id}/thumbnail",
            )
        )
    return items


@router.get("/sightings/{sighting_id}", response_model=SightingDetail)
def admin_sighting_detail(sighting_id: str, db: Session = Depends(get_db)) -> dict:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    db.refresh(sighting, attribute_names=["photos"])
    last_seen = sighting.last_seen_at or sighting.created_at
    return {
        "id": sighting.id,
        "lat": sighting.lat,
        "lng": sighting.lng,
        "description": sighting.description,
        "confirmations_count": sighting.confirmations_count,
        "created_at": sighting.created_at,
        "last_seen_at": last_seen,
        "stale": False,
        "photo_url": f"/api/admin/sightings/{sighting.id}/photo",
        "thumbnail_url": f"/api/admin/sightings/{sighting.id}/thumbnail",
        "photos": _admin_photos(sighting),
        "color": sighting.color,
        "is_ear_tipped": sighting.is_ear_tipped,
        "is_stray": sighting.is_stray,
        "cat_id": sighting.cat_id,
        "kind": sighting.kind,
        "status": sighting.status,
        "cat_name": sighting.cat_name,
        "contact": sighting.contact,
    }


def _get_admin_extra_photo(db: Session, sighting_id: str, photo_id: str) -> Photo:
    _get_or_404(db, sighting_id)
    photo = db.get(Photo, photo_id)
    if photo is None or photo.sighting_id != sighting_id:
        raise HTTPException(status_code=404, detail="Photo not found.")
    return photo


@router.get("/sightings/{sighting_id}/photos/{photo_id}")
def admin_extra_photo(sighting_id: str, photo_id: str, db: Session = Depends(get_db)) -> Response:
    photo = _get_admin_extra_photo(db, sighting_id, photo_id)
    return Response(content=photo.photo, media_type=photo.photo_mime)


@router.get("/sightings/{sighting_id}/photos/{photo_id}/thumbnail")
def admin_extra_thumbnail(
    sighting_id: str, photo_id: str, db: Session = Depends(get_db)
) -> Response:
    photo = _get_admin_extra_photo(db, sighting_id, photo_id)
    return Response(content=photo.thumbnail, media_type=photo.photo_mime)


@router.delete("/sightings/{sighting_id}/photos/{photo_id}", status_code=204)
def admin_delete_photo(sighting_id: str, photo_id: str, db: Session = Depends(get_db)):
    photo = _get_admin_extra_photo(db, sighting_id, photo_id)
    _record_action(db, "delete_photo", sighting_id)
    db.delete(photo)
    db.commit()


@router.get("/comments", response_model=list[AdminCommentRow])
def list_comments(
    db: Session = Depends(get_db),
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AdminCommentRow]:
    if status is not None and status not in ("visible", "hidden"):
        raise HTTPException(status_code=400, detail="status must be 'visible' or 'hidden'.")
    stmt = select(Comment).order_by(Comment.created_at.desc())
    if status:
        stmt = stmt.where(Comment.status == status)
    rows = db.execute(stmt.limit(limit).offset(offset)).scalars().all()
    return [
        AdminCommentRow(
            id=c.id,
            sighting_id=c.sighting_id,
            text=c.text,
            status=c.status,
            reports_count=c.reports_count,
            created_at=c.created_at,
        )
        for c in rows
    ]


@router.post("/comments/{comment_id}/hide")
def hide_comment(comment_id: str, db: Session = Depends(get_db)) -> dict:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found.")
    comment.status = "hidden"
    db.commit()
    return {"id": comment.id, "status": comment.status}


@router.post("/comments/{comment_id}/unhide")
def unhide_comment(comment_id: str, db: Session = Depends(get_db)) -> dict:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found.")
    comment.status = "visible"
    db.commit()
    return {"id": comment.id, "status": comment.status}


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: str, db: Session = Depends(get_db)):
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found.")
    db.delete(comment)
    db.commit()


@router.get("/blocked-tokens", response_model=list[BlockedTokenRow])
def list_blocked(
    db: Session = Depends(get_db), limit: int = 50, offset: int = 0
) -> list[BlockedTokenRow]:
    rows = db.execute(
        select(BlockedToken).order_by(BlockedToken.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all()
    return [BlockedTokenRow(token=r.token, reason=r.reason, created_at=r.created_at) for r in rows]


@router.post("/blocked-tokens")
def block_token(
    token: str = Form(...),
    reason: str = Form(""),
    db: Session = Depends(get_db),
) -> dict:
    value = token.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Token required.")
    row = BlockedToken(token=value, reason=(reason or "").strip()[:280])
    db.merge(row)
    db.commit()
    return {"token": value, "blocked": True}


@router.delete("/blocked-tokens/{token_value}", status_code=204)
def unblock_token(token_value: str, db: Session = Depends(get_db)):
    row = db.get(BlockedToken, token_value)
    if row:
        db.delete(row)
        db.commit()


@router.post("/push/test")
def test_push(
    device_token: str = Form(...),
    title: str = Form("CatMap test"),
    body: str = Form("Push notifications are working."),
    url: str = Form("/"),
    db: Session = Depends(get_db),
) -> dict:
    """Send a test push to every subscription for a device token."""
    token = device_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="device_token required.")

    subs = db.execute(
        select(PushSubscription).where(PushSubscription.device_token == token)
    ).scalars().all()

    for sub in subs:
        submit_push(
            sub,
            title=title.strip() or "CatMap test",
            body=body.strip(),
            url=url.strip() or "/",
        )

    return {"subscriptions_found": len(subs), "queued": len(subs)}
