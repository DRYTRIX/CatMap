"""Add contact_public on sightings and watches table.

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sightings",
        sa.Column(
            "contact_public",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_table(
        "watches",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("device_token", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=16), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "device_token", "target_type", "target_id", name="uq_watch_once"
        ),
    )
    op.create_index("ix_watches_device_token", "watches", ["device_token"])
    op.create_index(
        "ix_watches_target", "watches", ["target_type", "target_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_watches_target", table_name="watches")
    op.drop_index("ix_watches_device_token", table_name="watches")
    op.drop_table("watches")
    op.drop_column("sightings", "contact_public")
