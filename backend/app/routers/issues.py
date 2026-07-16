"""User-submitted app issue / feedback reports."""

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import writable_device_token
from ..models import IssueReport
from ..notifications import notify_issue_reported
from ..ratelimit import limiter
from ..schemas import IssueReportResult

router = APIRouter(prefix="/issues", tags=["issues"])

ALLOWED_CATEGORIES = {"bug", "wrong_data", "abuse", "other"}
MAX_MESSAGE = 2000
MAX_PAGE_URL = 2048

settings = get_settings()


@router.post("", response_model=IssueReportResult, status_code=201)
@limiter.limit(settings.rate_limit_issue)
def submit_issue(
    request: Request,
    background_tasks: BackgroundTasks,
    category: str = Form(...),
    message: str = Form(...),
    page_url: str = Form(""),
    token: str = Depends(writable_device_token),
    db: Session = Depends(get_db),
) -> IssueReportResult:
    """Submit an app issue report; stored in DB and sent to Telegram."""
    category = (category or "").strip()
    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid issue category.")

    message = (message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")
    if len(message) > MAX_MESSAGE:
        raise HTTPException(
            status_code=400,
            detail=f"Message must be at most {MAX_MESSAGE} characters.",
        )

    page_url = (page_url or "").strip() or None
    if page_url and len(page_url) > MAX_PAGE_URL:
        raise HTTPException(status_code=400, detail="Page URL is too long.")

    issue = IssueReport(
        device_token=token,
        category=category,
        message=message,
        page_url=page_url,
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)

    background_tasks.add_task(
        notify_issue_reported,
        category=issue.category,
        message=issue.message,
        page_url=issue.page_url,
    )

    return IssueReportResult(id=issue.id)
