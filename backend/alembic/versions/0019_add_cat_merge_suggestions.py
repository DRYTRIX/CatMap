"""Add cat merge suggestions.

Revision ID: 0019
Revises: 0018
Create Date: 2026-09-20

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cat_merge_suggestions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("from_cat_id", sa.String(length=36), nullable=False),
        sa.Column("into_cat_id", sa.String(length=36), nullable=False),
        sa.Column("suggested_by", sa.String(length=64), nullable=False),
        sa.Column("from_approved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("into_approved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cat_merge_suggestions_from_cat_id", "cat_merge_suggestions", ["from_cat_id"])
    op.create_index("ix_cat_merge_suggestions_into_cat_id", "cat_merge_suggestions", ["into_cat_id"])


def downgrade() -> None:
    op.drop_index("ix_cat_merge_suggestions_into_cat_id", table_name="cat_merge_suggestions")
    op.drop_index("ix_cat_merge_suggestions_from_cat_id", table_name="cat_merge_suggestions")
    op.drop_table("cat_merge_suggestions")
