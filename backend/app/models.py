import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class Sighting(Base):
    __tablename__ = "sightings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)

    photo: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    thumbnail: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    photo_mime: Mapped[str] = mapped_column(String(50), nullable=False)

    confirmations_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    # Bumped on each confirmation; drives the "stale" indicator. NULL for rows
    # created before this column existed (treated as created_at).
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=True
    )
    creator_token: Mapped[str] = mapped_column(String(64), nullable=False)
    # "active", "hidden" (moderation), "gone" (creator marked the cat left),
    # or "found" (creator closed a missing-cat post).
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)

    # Distinct device reports; auto-hidden once this reaches the threshold.
    reports_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ML cat-detection score (0.0–1.0); NULL for rows created before this feature.
    cat_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Post type: "sighting" (spotted cat) or "missing" (lost cat seeking help).
    kind: Mapped[str] = mapped_column(String(16), default="sighting", nullable=False)

    # Optional descriptive attributes; NULL means "unknown"/not specified.
    color: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_ear_tipped: Mapped[bool | None] = mapped_column(nullable=True)
    is_stray: Mapped[bool | None] = mapped_column(nullable=True)

    # Optional link to a recurring-cat profile (same individual cat).
    cat_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("cats.id", ondelete="SET NULL"), nullable=True, index=True
    )

    confirmations: Mapped[list["Confirmation"]] = relationship(
        back_populates="sighting", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="sighting", cascade="all, delete-orphan"
    )
    # Additional photos beyond the primary one stored on this row.
    photos: Mapped[list["Photo"]] = relationship(
        back_populates="sighting",
        cascade="all, delete-orphan",
        order_by="Photo.position",
    )
    cat: Mapped["Cat | None"] = relationship(back_populates="sightings")

    __table_args__ = (
        Index("ix_sightings_lat", "lat"),
        Index("ix_sightings_lng", "lng"),
        Index("ix_sightings_status", "status"),
        Index("ix_sightings_kind", "kind"),
        Index("ix_sightings_created_at", "created_at"),
    )


class Cat(Base):
    """A profile grouping multiple sightings of the same individual cat."""

    __tablename__ = "cats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    creator_token: Mapped[str] = mapped_column(String(64), nullable=False)

    sightings: Mapped[list["Sighting"]] = relationship(back_populates="cat")


class Confirmation(Base):
    __tablename__ = "confirmations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sighting_id: Mapped[str] = mapped_column(
        ForeignKey("sightings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_token: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    sighting: Mapped["Sighting"] = relationship(back_populates="confirmations")

    __table_args__ = (
        UniqueConstraint("sighting_id", "device_token", name="uq_confirm_once"),
    )


class Photo(Base):
    """An additional photo attached to a sighting (beyond the primary one)."""

    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sighting_id: Mapped[str] = mapped_column(
        ForeignKey("sightings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    photo: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    thumbnail: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    photo_mime: Mapped[str] = mapped_column(String(50), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Device token of whoever uploaded this photo. Null for photos added at
    # creation; set for community contributions added to an existing sighting.
    contributor_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    sighting: Mapped["Sighting"] = relationship(back_populates="photos")


class AdminAction(Base):
    """Audit log entry for moderation actions (hide/unhide/delete)."""

    __tablename__ = "admin_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    # Not a FK: the sighting may be deleted, but the audit entry must remain.
    sighting_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sighting_id: Mapped[str] = mapped_column(
        ForeignKey("sightings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_token: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(String(280), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    sighting: Mapped["Sighting"] = relationship(back_populates="reports")

    __table_args__ = (
        UniqueConstraint("sighting_id", "device_token", name="uq_report_once"),
    )


class IssueReport(Base):
    """User-submitted app issue / feedback (not sighting moderation)."""

    __tablename__ = "issue_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    device_token: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    page_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    __table_args__ = (
        Index("ix_issue_reports_status", "status"),
        Index("ix_issue_reports_created_at", "created_at"),
    )
