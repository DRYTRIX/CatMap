"""Add cats table and sightings.cat_id for recurring-cat profiles.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-13

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cats",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("creator_token", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # batch_alter_table is required for SQLite (FK + column add).
    with op.batch_alter_table("sightings", schema=None) as batch_op:
        batch_op.add_column(sa.Column("cat_id", sa.String(length=36), nullable=True))
        batch_op.create_index("ix_sightings_cat_id", ["cat_id"])
        batch_op.create_foreign_key(
            "fk_sightings_cat_id",
            "cats",
            ["cat_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("sightings", schema=None) as batch_op:
        batch_op.drop_constraint("fk_sightings_cat_id", type_="foreignkey")
        batch_op.drop_index("ix_sightings_cat_id")
        batch_op.drop_column("cat_id")
    op.drop_table("cats")
