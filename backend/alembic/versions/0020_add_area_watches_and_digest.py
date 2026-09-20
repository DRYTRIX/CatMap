"""Add area watches and the weekly digest preference.

Revision ID: 0020
Revises: 0019
Create Date: 2026-09-20

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("watches", sa.Column("lat", sa.Float(), nullable=True))
    op.add_column("watches", sa.Column("lng", sa.Float(), nullable=True))
    op.add_column("watches", sa.Column("radius_km", sa.Float(), nullable=True))
    op.add_column("watches", sa.Column("label", sa.String(length=60), nullable=True))
    op.add_column(
        "users",
        sa.Column("email_digest", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("last_digest_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_digest_at")
    op.drop_column("users", "email_digest")
    op.drop_column("watches", "label")
    op.drop_column("watches", "radius_km")
    op.drop_column("watches", "lng")
    op.drop_column("watches", "lat")
