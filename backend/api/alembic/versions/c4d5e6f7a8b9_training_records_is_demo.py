"""training_records.is_demo 추가 — 모든 로그인 회원이 조회·다운로드하는 공용 데모 이력

staging 데모용 시드 데이터 구분 마커. prod 에는 시드하지 않는다.

Revision ID: c4d5e6f7a8b9
Revises: f1c2d3e4a5b6
Create Date: 2026-09-15
"""

import sqlalchemy as sa

from alembic import op

revision = "c4d5e6f7a8b9"
down_revision = "f1c2d3e4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "training_records",
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("training_records", "is_demo")
