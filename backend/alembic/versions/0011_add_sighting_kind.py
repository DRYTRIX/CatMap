"""Add kind column to sightings (sighting | missing).

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-16

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sightings",
        sa.Column(
            "kind",
            sa.String(length=16),
            nullable=False,
            server_default="sighting",
        ),
    )
    op.create_index("ix_sightings_kind", "sightings", ["kind"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sightings_kind", table_name="sightings")
    op.drop_column("sightings", "kind")
