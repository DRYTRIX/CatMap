"""Baseline schema (pre cat_confidence).

Revision ID: 0001
Revises:
Create Date: 2026-06-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sightings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("photo", sa.LargeBinary(), nullable=False),
        sa.Column("thumbnail", sa.LargeBinary(), nullable=False),
        sa.Column("photo_mime", sa.String(length=50), nullable=False),
        sa.Column("confirmations_count", sa.Integer(), nullable=False),
        sa.Column("creator_token", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("reports_count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sightings_lat", "sightings", ["lat"], unique=False)
    op.create_index("ix_sightings_lng", "sightings", ["lng"], unique=False)
    op.create_index("ix_sightings_status", "sightings", ["status"], unique=False)

    op.create_table(
        "confirmations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sighting_id", sa.String(length=36), nullable=False),
        sa.Column("device_token", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["sighting_id"], ["sightings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sighting_id", "device_token", name="uq_confirm_once"),
    )
    op.create_index(
        op.f("ix_confirmations_sighting_id"), "confirmations", ["sighting_id"], unique=False
    )

    op.create_table(
        "reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sighting_id", sa.String(length=36), nullable=False),
        sa.Column("device_token", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=280), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["sighting_id"], ["sightings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sighting_id", "device_token", name="uq_report_once"),
    )
    op.create_index(op.f("ix_reports_sighting_id"), "reports", ["sighting_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_reports_sighting_id"), table_name="reports")
    op.drop_table("reports")
    op.drop_index(op.f("ix_confirmations_sighting_id"), table_name="confirmations")
    op.drop_table("confirmations")
    op.drop_index("ix_sightings_status", table_name="sightings")
    op.drop_index("ix_sightings_lng", table_name="sightings")
    op.drop_index("ix_sightings_lat", table_name="sightings")
    op.drop_table("sightings")
