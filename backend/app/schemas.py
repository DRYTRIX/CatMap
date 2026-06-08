from datetime import datetime

from pydantic import BaseModel, Field


class SightingDot(BaseModel):
    """Lightweight representation used to render map markers."""

    id: str
    lat: float
    lng: float
    confirmations_count: int


class SightingDetail(BaseModel):
    id: str
    lat: float
    lng: float
    description: str
    confirmations_count: int
    created_at: datetime
    photo_url: str
    thumbnail_url: str


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
    created_at: datetime
    thumbnail_url: str


class CreateSightingResult(BaseModel):
    id: str
    lat: float
    lng: float
    description: str
    confirmations_count: int
    created_at: datetime
    photo_url: str
    thumbnail_url: str


class BBox(BaseModel):
    min_lat: float = Field(..., ge=-90, le=90)
    max_lat: float = Field(..., ge=-90, le=90)
    min_lng: float = Field(..., ge=-180, le=180)
    max_lng: float = Field(..., ge=-180, le=180)
