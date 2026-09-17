"""등급 발급 단가 + 교육생 생년월일

- membership_grades.price_krw: 가격 규칙 페이지 폐지 — 등급이 발급 단가를 직접 가짐.
  기존 시드값(일반 3000·평생/연간 1800)을 백필.
- trainees.birth_date: 교육생 수정 항목 (전화·성명·생년월일).

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-09-17
"""

import sqlalchemy as sa

from alembic import op

revision = "e9f0a1b2c3d4"
down_revision = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "membership_grades",
        sa.Column(
            "price_krw", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )
    op.execute(
        """
        UPDATE membership_grades
        SET price_krw = CASE code
            WHEN 'general' THEN 3000
            WHEN 'lifetime' THEN 1800
            WHEN 'annual' THEN 1800
            ELSE 0
        END
        """
    )
    op.alter_column("membership_grades", "price_krw", server_default=None)
    op.add_column("trainees", sa.Column("birth_date", sa.Date()))


def downgrade() -> None:
    op.drop_column("trainees", "birth_date")
    op.drop_column("membership_grades", "price_krw")
