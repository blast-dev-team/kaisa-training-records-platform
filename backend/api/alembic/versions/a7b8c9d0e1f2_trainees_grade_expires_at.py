"""trainees.grade_expires_at — 연간 등급 만료일

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "trainees",
        sa.Column("grade_expires_at", sa.Date(), nullable=True),
    )
    op.create_index(
        "ix_trainees_grade_expires_at", "trainees", ["grade_expires_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_trainees_grade_expires_at", table_name="trainees")
    op.drop_column("trainees", "grade_expires_at")
