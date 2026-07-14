"""Add issue_reports table for user-submitted app feedback.

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-14

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "issue_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("device_token", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("page_url", sa.String(length=2048), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_issue_reports_status", "issue_reports", ["status"], unique=False)
    op.create_index("ix_issue_reports_created_at", "issue_reports", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_issue_reports_created_at", table_name="issue_reports")
    op.drop_index("ix_issue_reports_status", table_name="issue_reports")
    op.drop_table("issue_reports")
