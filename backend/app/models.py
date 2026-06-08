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
    creator_token: Mapped[str] = mapped_column(String(64), nullable=False)
    # "active" or "hidden" (hook for future moderation).
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)

    # Distinct device reports; auto-hidden once this reaches the threshold.
    reports_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    confirmations: Mapped[list["Confirmation"]] = relationship(
        back_populates="sighting", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="sighting", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_sightings_lat", "lat"),
        Index("ix_sightings_lng", "lng"),
        Index("ix_sightings_status", "status"),
    )


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
