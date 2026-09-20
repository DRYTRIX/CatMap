"""Add moderation context to admin actions, and cat-profile reports.

Revision ID: 0021
Revises: 0020
Create Date: 2026-09-20

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("admin_actions", sa.Column("reason", sa.String(length=280), nullable=True))
    op.add_column("admin_actions", sa.Column("admin_label", sa.String(length=60), nullable=True))
    op.create_table(
        "cat_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("cat_id", sa.String(length=36), nullable=False),
        sa.Column("device_token", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=280), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["cat_id"], ["cats.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cat_id", "device_token", name="uq_cat_report_once"),
    )
    op.create_index("ix_cat_reports_cat_id", "cat_reports", ["cat_id"])


def downgrade() -> None:
    op.drop_index("ix_cat_reports_cat_id", table_name="cat_reports")
    op.drop_table("cat_reports")
    op.drop_column("admin_actions", "admin_label")
    op.drop_column("admin_actions", "reason")
