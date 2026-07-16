"""Add comments table for sighting tips and discussion.

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-16

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sighting_id", sa.String(length=36), nullable=False),
        sa.Column("device_token", sa.String(length=64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="visible",
        ),
        sa.Column("reports_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["sighting_id"], ["sightings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_comments_sighting_id", "comments", ["sighting_id"], unique=False)
    op.create_index("ix_comments_status", "comments", ["status"], unique=False)

    op.create_table(
        "comment_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("comment_id", sa.String(length=36), nullable=False),
        sa.Column("device_token", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["comments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("comment_id", "device_token", name="uq_comment_report_once"),
    )
    op.create_index(
        "ix_comment_reports_comment_id", "comment_reports", ["comment_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_comment_reports_comment_id", table_name="comment_reports")
    op.drop_table("comment_reports")
    op.drop_index("ix_comments_status", table_name="comments")
    op.drop_index("ix_comments_sighting_id", table_name="comments")
    op.drop_table("comments")
