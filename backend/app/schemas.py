from datetime import datetime

from pydantic import BaseModel, Field


class SightingDot(BaseModel):
    """Lightweight representation used to render map markers and the list view."""

    id: str
    lat: float
    lng: float
    confirmations_count: int
    description: str
    created_at: datetime
    thumbnail_url: str
    stale: bool = False
    kind: str = "sighting"


class PhotoOut(BaseModel):
    """A single photo attached to a sighting."""

    id: str
    position: int
    photo_url: str
    thumbnail_url: str


class SightingDetail(BaseModel):
    id: str
    lat: float
    lng: float
    description: str
    confirmations_count: int
    created_at: datetime
    last_seen_at: datetime | None = None
    stale: bool = False
    photo_url: str
    thumbnail_url: str
    photos: list[PhotoOut]
    color: str | None = None
    is_ear_tipped: bool | None = None
    is_stray: bool | None = None
    cat_id: str | None = None
    kind: str = "sighting"
    status: str = "active"
    cat_name: str | None = None
    contact: str | None = None
    contact_public: bool = False
    is_mine: bool = False
    watching: bool = False


class SightingCluster(BaseModel):
    """Aggregated grid cell of sightings for zoomed-out map views."""

    lat: float
    lng: float
    count: int


class ConfirmResult(BaseModel):
    confirmations: int
    already_confirmed: bool


class ReportResult(BaseModel):
    reported: bool  # False when this device had already reported it
    hidden: bool  # True once auto-hidden by the report threshold


class IssueReportResult(BaseModel):
    id: str
    submitted: bool = True


class AdminIssueRow(BaseModel):
    id: str
    category: str
    message: str
    page_url: str | None
    status: str
    created_at: datetime


class AdminReportRow(BaseModel):
    id: str
    lat: float
    lng: float
    description: str
    status: str
    reports_count: int
    confirmations_count: int
    cat_confidence: float | None
    created_at: datetime
    thumbnail_url: str
    creator_token: str = ""
    kind: str = "sighting"


class AdminActionRow(BaseModel):
    id: str
    action: str
    sighting_id: str
    created_at: datetime


class AdminDailyCount(BaseModel):
    date: str
    count: int


class AdminMetrics(BaseModel):
    """Aggregate counts for the admin dashboard overview."""

    total_sightings: int
    active_sightings: int
    hidden_sightings: int
    pending_sightings: int
    gone_sightings: int
    stale_sightings: int
    reported_sightings: int
    total_reports: int
    total_confirmations: int
    extra_photos: int
    avg_cat_confidence: float | None
    actions_last_7d: dict[str, int]
    new_sightings_by_day: list[AdminDailyCount]


class DatabaseTableUsage(BaseModel):
    """Storage footprint and row count for a single table."""

    name: str
    size_bytes: int
    row_count: int


class DatabaseUsage(BaseModel):
    """Database storage overview for the admin dashboard."""

    total_size_bytes: int
    capacity_bytes: int | None  # None when DB_CAPACITY_MB is unset
    image_storage_bytes: int  # sightings + photos table totals
    avg_photo_size_bytes: int | None
    avg_thumbnail_size_bytes: int | None
    tables: list[DatabaseTableUsage]  # sorted largest-first


class CatProfileSighting(BaseModel):
    """A sighting linked to a cat profile."""

    id: str
    lat: float
    lng: float
    description: str
    created_at: datetime
    last_seen_at: datetime | None = None
    thumbnail_url: str
    confirmations_count: int


class CatProfile(BaseModel):
    id: str
    name: str | None = None
    created_at: datetime
    sightings: list[CatProfileSighting]
    first_seen_at: datetime
    last_seen_at: datetime
    sighting_count: int
    color: str | None = None
    is_ear_tipped: bool | None = None
    is_stray: bool | None = None
    is_mine: bool = False
    watching: bool = False


class CreateSightingResult(BaseModel):
    id: str
    lat: float
    lng: float
    description: str
    confirmations_count: int
    created_at: datetime
    last_seen_at: datetime | None = None
    stale: bool = False
    photo_url: str
    thumbnail_url: str
    photos: list[PhotoOut]
    color: str | None = None
    is_ear_tipped: bool | None = None
    is_stray: bool | None = None
    pending: bool = False
    cat_id: str | None = None
    kind: str = "sighting"
    status: str = "active"
    cat_name: str | None = None
    contact: str | None = None
    contact_public: bool = False
    is_mine: bool = True
    watching: bool = False


class BBox(BaseModel):
    min_lat: float = Field(..., ge=-90, le=90)
    max_lat: float = Field(..., ge=-90, le=90)
    min_lng: float = Field(..., ge=-180, le=180)
    max_lng: float = Field(..., ge=-180, le=180)


class CommentOut(BaseModel):
    id: str
    sighting_id: str
    text: str
    lat: float | None = None
    lng: float | None = None
    created_at: datetime
    is_mine: bool = False


class CommentReportResult(BaseModel):
    reported: bool
    hidden: bool


class AdminCommentRow(BaseModel):
    id: str
    sighting_id: str
    text: str
    status: str
    reports_count: int
    created_at: datetime


class NotificationOut(BaseModel):
    id: str
    type: str
    sighting_id: str | None = None
    comment_id: str | None = None
    payload_json: str
    created_at: datetime
    read_at: datetime | None = None


class UnreadCountResult(BaseModel):
    count: int


class PushSubscribeResult(BaseModel):
    subscribed: bool
    id: str


class PushAlertPrefs(BaseModel):
    """Nearby-alert preferences for the calling device (any platform)."""

    has_subscription: bool = False
    alert_lat: float | None = None
    alert_lng: float | None = None
    alert_radius_km: float | None = None


class WatchOut(BaseModel):
    id: str
    target_type: str
    target_id: str
    created_at: datetime


class WatchResult(BaseModel):
    watching: bool
    id: str | None = None


class PrivateMessageResult(BaseModel):
    sent: bool = True


class BlockedTokenRow(BaseModel):
    token: str
    reason: str
    created_at: datetime
