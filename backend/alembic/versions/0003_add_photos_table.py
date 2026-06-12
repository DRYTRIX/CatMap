"""Add photos table for multi-photo sightings.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "photos",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sighting_id", sa.String(length=36), nullable=False),
        sa.Column("photo", sa.LargeBinary(), nullable=False),
        sa.Column("thumbnail", sa.LargeBinary(), nullable=False),
        sa.Column("photo_mime", sa.String(length=50), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["sighting_id"], ["sightings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_photos_sighting_id"), "photos", ["sighting_id"], unique=False)
    op.create_index("ix_sightings_created_at", "sightings", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sightings_created_at", table_name="sightings")
    op.drop_index(op.f("ix_photos_sighting_id"), table_name="photos")
    op.drop_table("photos")
