"""Add missing-cat resolution fields and reminder timestamp.

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-20

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sightings", sa.Column("found_outcome", sa.String(length=24), nullable=True))
    op.add_column("sightings", sa.Column("found_story", sa.String(length=500), nullable=True))
    op.add_column("sightings", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "sightings", sa.Column("last_reminded_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("sightings", "last_reminded_at")
    op.drop_column("sightings", "resolved_at")
    op.drop_column("sightings", "found_story")
    op.drop_column("sightings", "found_outcome")
