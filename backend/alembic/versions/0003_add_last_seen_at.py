"""Add last_seen_at to sightings.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-16

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sightings",
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill existing rows so "last seen" starts at creation time.
    op.execute("UPDATE sightings SET last_seen_at = created_at WHERE last_seen_at IS NULL")


def downgrade() -> None:
    op.drop_column("sightings", "last_seen_at")
