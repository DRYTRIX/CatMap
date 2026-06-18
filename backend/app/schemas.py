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


class BBox(BaseModel):
    min_lat: float = Field(..., ge=-90, le=90)
    max_lat: float = Field(..., ge=-90, le=90)
    min_lng: float = Field(..., ge=-180, le=180)
    max_lng: float = Field(..., ge=-180, le=180)
