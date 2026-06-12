"""Add optional descriptive attributes to sightings.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sightings", sa.Column("color", sa.String(length=30), nullable=True))
    op.add_column("sightings", sa.Column("is_ear_tipped", sa.Boolean(), nullable=True))
    op.add_column("sightings", sa.Column("is_stray", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("sightings", "is_stray")
    op.drop_column("sightings", "is_ear_tipped")
    op.drop_column("sightings", "color")
