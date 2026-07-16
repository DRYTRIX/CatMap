"""Add cat_name and contact columns for missing-cat posts.

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-16

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sightings",
        sa.Column("cat_name", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "sightings",
        sa.Column("contact", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sightings", "contact")
    op.drop_column("sightings", "cat_name")
