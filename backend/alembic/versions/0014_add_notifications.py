"""Add notifications and push subscription tables.

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-16

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("recipient_token", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("sighting_id", sa.String(length=36), nullable=True),
        sa.Column("comment_id", sa.String(length=36), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notifications_recipient_token", "notifications", ["recipient_token"], unique=False
    )
    op.create_index(
        "ix_notifications_created_at", "notifications", ["created_at"], unique=False
    )

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("device_token", sa.String(length=64), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("subscription", sa.Text(), nullable=False),
        sa.Column("alert_lat", sa.Float(), nullable=True),
        sa.Column("alert_lng", sa.Float(), nullable=True),
        sa.Column("alert_radius_km", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "device_token", "subscription", name="uq_push_sub_device_subscription"
        ),
    )
    op.create_index(
        "ix_push_subscriptions_device_token",
        "push_subscriptions",
        ["device_token"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_push_subscriptions_device_token", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
    op.drop_index("ix_notifications_created_at", table_name="notifications")
    op.drop_index("ix_notifications_recipient_token", table_name="notifications")
    op.drop_table("notifications")
