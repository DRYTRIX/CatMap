"""Add composite index on sightings (status, lat, lng) for bbox queries.

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-13

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_sightings_status_lat_lng",
        "sightings",
        ["status", "lat", "lng"],
    )


def downgrade() -> None:
    op.drop_index("ix_sightings_status_lat_lng", table_name="sightings")
