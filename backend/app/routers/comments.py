"""Comments / tips on sightings."""

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import no_cache, optional_device_token, writable_device_token
from ..models import Comment, CommentReport, Sighting
from ..notifications import notify_comment_reported
from ..ratelimit import limiter
from ..schemas import CommentOut, CommentReportResult

router = APIRouter(prefix="/sightings", tags=["comments"])

settings = get_settings()
MAX_COMMENT_TEXT = 500
VIEWABLE_STATUSES = {"active", "found"}


def _get_viewable_sighting(db: Session, sighting_id: str) -> Sighting:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None or sighting.status not in VIEWABLE_STATUSES:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    return sighting


def _comment_out(c: Comment, token: str | None) -> CommentOut:
    return CommentOut(
        id=c.id,
        sighting_id=c.sighting_id,
        text=c.text,
        lat=c.lat,
        lng=c.lng,
        created_at=c.created_at,
        is_mine=bool(token and c.device_token == token),
    )


@router.get("/{sighting_id}/comments", response_model=list[CommentOut])
def list_comments(
    sighting_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    token: str | None = Depends(optional_device_token),
    db: Session = Depends(get_db),
    _: None = Depends(no_cache),
) -> list[CommentOut]:
    _get_viewable_sighting(db, sighting_id)
    stmt = (
        select(Comment)
        .where(
            Comment.sighting_id == sighting_id,
            Comment.status == "visible",
        )
        .order_by(Comment.created_at.asc())
        .offset(offset)
        .limit(limit)
    )
    rows = db.execute(stmt).scalars().all()
    return [_comment_out(c, token) for c in rows]


@router.post("/{sighting_id}/comments", response_model=CommentOut, status_code=201)
@limiter.limit(settings.rate_limit_comment)
def create_comment(
    request: Request,
    sighting_id: str,
    background_tasks: BackgroundTasks,
    text: str = Form(...),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> CommentOut:
    sighting = _get_viewable_sighting(db, sighting_id)
    if sighting.status != "active":
        raise HTTPException(status_code=404, detail="Sighting not found.")

    body = (text or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment text is required.")
    if len(body) > MAX_COMMENT_TEXT:
        raise HTTPException(status_code=400, detail=f"Comment exceeds {MAX_COMMENT_TEXT} characters.")

    if (lat is None) ^ (lng is None):
        raise HTTPException(status_code=400, detail="Provide both lat and lng for a location.")
    if lat is not None and not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Coordinates out of range.")

    comment = Comment(
        sighting_id=sighting_id,
        device_token=token,
        text=body,
        lat=lat,
        lng=lng,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    from ..user_notifications import notify_comment_posted

    background_tasks.add_task(
        notify_comment_posted,
        comment_id=comment.id,
        sighting_id=sighting_id,
        author_token=token,
        sighting_creator_token=sighting.creator_token,
    )

    return _comment_out(comment, token)


@router.delete("/{sighting_id}/comments/{comment_id}", status_code=204)
@limiter.shared_limit(settings.rate_limit_mutate, scope="mutate")
def delete_comment(
    request: Request,
    sighting_id: str,
    comment_id: str,
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> Response:
    sighting = db.get(Sighting, sighting_id)
    if sighting is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")

    comment = db.get(Comment, comment_id)
    if comment is None or comment.sighting_id != sighting_id:
        raise HTTPException(status_code=404, detail="Comment not found.")

    if comment.device_token != token and sighting.creator_token != token:
        raise HTTPException(status_code=403, detail="Not allowed to delete this comment.")

    db.delete(comment)
    db.commit()
    return Response(status_code=204)


@router.post("/{sighting_id}/comments/{comment_id}/report", response_model=CommentReportResult)
@limiter.limit(settings.rate_limit_report)
def report_comment(
    request: Request,
    sighting_id: str,
    comment_id: str,
    background_tasks: BackgroundTasks,
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> CommentReportResult:
    _get_viewable_sighting(db, sighting_id)
    comment = db.get(Comment, comment_id)
    if comment is None or comment.sighting_id != sighting_id or comment.status != "visible":
        raise HTTPException(status_code=404, detail="Comment not found.")

    report = CommentReport(comment_id=comment_id, device_token=token)
    db.add(report)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return CommentReportResult(reported=False, hidden=comment.status == "hidden")

    comment.reports_count += 1
    auto_hidden = False
    if comment.reports_count >= settings.auto_hide_threshold:
        comment.status = "hidden"
        auto_hidden = True
    db.commit()

    background_tasks.add_task(
        notify_comment_reported,
        sighting_id=sighting_id,
        comment_id=comment_id,
        reports_count=comment.reports_count,
        hidden=auto_hidden,
    )
    if auto_hidden and comment.device_token:
        from ..user_notifications import notify_comment_hidden

        background_tasks.add_task(
            notify_comment_hidden,
            comment_id=comment_id,
            author_token=comment.device_token,
            sighting_id=sighting_id,
        )

    return CommentReportResult(reported=True, hidden=comment.status == "hidden")
