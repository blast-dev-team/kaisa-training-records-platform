"""users.birth 추가 — PASS 본인인증으로 확정된 생년월일 (YYYYMMDD)

Revision ID: f1c2d3e4a5b6
Revises: a3f8c21e9d4b
Create Date: 2026-09-15
"""

import sqlalchemy as sa

from alembic import op

revision = "f1c2d3e4a5b6"
down_revision = "a3f8c21e9d4b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("birth", sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "birth")
