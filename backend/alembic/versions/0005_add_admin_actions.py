"""Add admin_actions table for the moderation audit log.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_actions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("sighting_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_admin_actions_sighting_id"), "admin_actions", ["sighting_id"], unique=False
    )
    op.create_index(
        "ix_admin_actions_created_at", "admin_actions", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_admin_actions_created_at", table_name="admin_actions")
    op.drop_index(op.f("ix_admin_actions_sighting_id"), table_name="admin_actions")
    op.drop_table("admin_actions")
