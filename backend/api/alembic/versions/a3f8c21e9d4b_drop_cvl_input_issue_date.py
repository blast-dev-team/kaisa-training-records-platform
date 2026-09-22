"""certificate_verification_logs.input_issue_date — 발급날짜 입력 제거

진위확인이 확인서 번호만으로 조회되도록 바뀌면서 확인서에 적힌 발급일 입력이
불필요해졌다. 조회 이력의 input_issue_date 컬럼을 제거한다.

Revision ID: a3f8c21e9d4b
Revises: b7f2c9a41d3e
Create Date: 2026-09-15
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3f8c21e9d4b"
down_revision: str | None = "b7f2c9a41d3e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("certificate_verification_logs", "input_issue_date")


def downgrade() -> None:
    op.add_column(
        "certificate_verification_logs",
        sa.Column("input_issue_date", sa.Date(), nullable=False),
    )
