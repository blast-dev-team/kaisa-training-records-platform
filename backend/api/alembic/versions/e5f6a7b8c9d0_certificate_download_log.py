"""certificates 다운로드 기록 — WEB에서 PDF 저장 시 최초 시각·횟수 추적

WEB의 PDF 저장은 브라우저에서 이뤄지므로 별도 로그 엔드포인트 호출로만 인지 가능.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-19
"""

import sqlalchemy as sa

from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "certificates",
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "certificates",
        sa.Column("download_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("certificates", "download_count")
    op.drop_column("certificates", "downloaded_at")
