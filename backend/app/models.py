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

    # Missing-cat posts: optional name and how to reach the owner.
    cat_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contact: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # When False (default), contact is only shown to the creator; public viewers
    # can still send a private tip via the message endpoint.
    contact_public: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Optional descriptive attributes; NULL means "unknown"/not specified.
    color: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_ear_tipped: Mapped[bool | None] = mapped_column(nullable=True)
    is_stray: Mapped[bool | None] = mapped_column(nullable=True)

    # Optional link to a recurring-cat profile (same individual cat).
    cat_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("cats.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Denormalized public heart count (see Heart table).
    hearts_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Missing-cat resolution: how it ended, an optional short story, and when.
    found_outcome: Mapped[str | None] = mapped_column(String(24), nullable=True)
    found_story: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Last "still missing?" reminder sent to the owner (throttles the job).
    last_reminded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="sighting", cascade="all, delete-orphan", order_by="Comment.created_at"
    )

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
    hearts_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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
    # For cat actions (delete_cat, merge_cats) this holds the cat id.
    sighting_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    # Why the action was taken, and who took it. The label is self-declared via
    # the X-Admin-Label header (there is one shared admin token), so it's for
    # accountability between moderators, not authentication.
    reason: Mapped[str | None] = mapped_column(String(280), nullable=True)
    admin_label: Mapped[str | None] = mapped_column(String(60), nullable=True)


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


class CatReport(Base):
    """A report against a cat profile (e.g. wrong name or mixed-up cats)."""

    __tablename__ = "cat_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    cat_id: Mapped[str] = mapped_column(
        ForeignKey("cats.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_token: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(String(280), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    __table_args__ = (UniqueConstraint("cat_id", "device_token", name="uq_cat_report_once"),)


class Comment(Base):
    """User tip or note on a sighting (especially missing-cat posts)."""

    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sighting_id: Mapped[str] = mapped_column(
        ForeignKey("sightings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_token: Mapped[str] = mapped_column(String(64), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="visible", nullable=False)
    reports_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    sighting: Mapped["Sighting"] = relationship(back_populates="comments")
    reports: Mapped[list["CommentReport"]] = relationship(
        back_populates="comment", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_comments_status", "status"),)


class CommentReport(Base):
    __tablename__ = "comment_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    comment_id: Mapped[str] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_token: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    comment: Mapped["Comment"] = relationship(back_populates="reports")

    __table_args__ = (
        UniqueConstraint("comment_id", "device_token", name="uq_comment_report_once"),
    )


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    recipient_token: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    sighting_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    comment_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False, index=True
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # When an email was sent for this notification (throttling / audit).
    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    device_token: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    subscription: Mapped[str] = mapped_column(Text, nullable=False)
    alert_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    alert_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    alert_radius_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "device_token", "subscription", name="uq_push_sub_device_subscription"
        ),
    )


class BlockedToken(Base):
    __tablename__ = "blocked_tokens"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    reason: Mapped[str] = mapped_column(String(280), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )


class Watch(Base):
    """Follow a sighting or cat profile for activity alerts (confirm/tip/found)."""

    __tablename__ = "watches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    device_token: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # "sighting" or "cat"
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    target_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    # Area watches (target_type "area"): alert for new cats within radius_km of
    # (lat, lng). target_id is a generated id; label is a user-chosen name.
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    radius_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    label: Mapped[str | None] = mapped_column(String(60), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "device_token", "target_type", "target_id", name="uq_watch_once"
        ),
        Index("ix_watches_target", "target_type", "target_id"),
    )


class CatMergeSuggestion(Base):
    """Proposal that two cat profiles are the same cat (``from`` folds into ``into``).

    Both profiles' owners must approve before the merge runs; an owner approves
    their side implicitly when they make the suggestion.
    """

    __tablename__ = "cat_merge_suggestions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    # Plain ids (no FK): rows are removed explicitly when a profile is merged away.
    from_cat_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    into_cat_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    suggested_by: Mapped[str] = mapped_column(String(64), nullable=False)
    from_approved: Mapped[bool] = mapped_column(default=False, nullable=False)
    into_approved: Mapped[bool] = mapped_column(default=False, nullable=False)
    # "pending", "accepted" or "rejected"
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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


class User(Base):
    """Optional account layered on top of anonymous device tokens."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Null for Google-only accounts until they set a password.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Private — used in emails and the account UI, never shown publicly.
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unsubscribe_token: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, default=_uuid
    )
    email_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    email_activity: Mapped[bool] = mapped_column(default=True, nullable=False)
    email_following: Mapped[bool] = mapped_column(default=True, nullable=False)
    email_nearby: Mapped[bool] = mapped_column(default=True, nullable=False)
    email_moderation: Mapped[bool] = mapped_column(default=True, nullable=False)
    # Weekly summary of new cats in the user's watched areas. Opt-in.
    email_digest: Mapped[bool] = mapped_column(default=False, nullable=False)
    last_digest_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    blocked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    identities: Mapped[list["UserIdentity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    devices: Mapped[list["UserDevice"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserIdentity(Base):
    """OAuth provider subject linked to a user (e.g. Google)."""

    __tablename__ = "user_identities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="identities")

    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_user_identity_provider"),
    )


class UserDevice(Base):
    """Links an anonymous device token to an account (many devices per user)."""

    __tablename__ = "user_devices"

    device_token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="devices")


class UserSession(Base):
    """Opaque server-side session; only the sha256 of the token is stored."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="sessions")


class EmailToken(Base):
    """Single-use verification / password-reset token (sha256 stored only)."""

    __tablename__ = "email_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Heart(Base):
    """Server-side heart (replaces client-only favorites)."""

    __tablename__ = "hearts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    # "sighting" or "cat"
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    target_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_token: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "target_type", "target_id", "device_token", name="uq_heart_device"
        ),
        Index("ix_hearts_target", "target_type", "target_id"),
    )
