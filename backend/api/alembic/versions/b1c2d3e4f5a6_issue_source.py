"""certificates·completion_certificates.issue_source — 발급 경로 구분

'member'(WEB 신청·결제) / 'admin'(어드민 발급 저장). 어드민 발급이 회원
유효본을 폐기하지 않고 독립 문서로 남으려면 발급 경로를 기록해 서로의 권리
판정에서 간섭하지 않게 해야 한다. 기존 건은 전부 회원 경로로 백필.

Revision ID: b1c2d3e4f5a6
Revises: a9b8c7d6e5f4
Create Date: 2026-09-30
"""

import sqlalchemy as sa

from alembic import op

revision = "b1c2d3e4f5a6"
down_revision = "a9b8c7d6e5f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("certificates", "completion_certificates"):
        op.add_column(
            table,
            sa.Column(
                "issue_source",
                sa.String(length=10),
                nullable=False,
                server_default="member",
            ),
        )


def downgrade() -> None:
    for table in ("certificates", "completion_certificates"):
        op.drop_column(table, "issue_source")
