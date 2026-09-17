"""trainees.deleted_at 추가 — 교육생 소프트딜리트

확인서·결제·이력이 trainee_id NOT NULL 로 물고 있어 hard delete 불가.
row 는 남기고 활성 조회만 숨김 (training_records 의 deleted_at 과 같은 패턴).

Revision ID: d8e9f0a1b2c3
Revises: 63cbf118cb75
Create Date: 2026-09-17
"""

import sqlalchemy as sa

from alembic import op

revision = "d8e9f0a1b2c3"
down_revision = "63cbf118cb75"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trainees", sa.Column("deleted_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("trainees", "deleted_at")
