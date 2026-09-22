"""certificates.bundle_no — 묶음 확인서 번호

한 번의 발급 이벤트(동시 발급된 N건)가 같은 묶음 번호를 공유한다.
기존 전 건은 1건짜리 묶음이므로 bundle_no = certificate_no 로 백필한다.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: str | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "certificates",
        sa.Column("bundle_no", sa.String(length=100), nullable=True),
    )
    # 기존 확인서는 전부 1건짜리 묶음 — 묶음 번호 = 자기 확인서 번호
    op.execute("UPDATE certificates SET bundle_no = certificate_no")
    op.create_index(
        "ix_certificates_bundle_no", "certificates", ["bundle_no"]
    )


def downgrade() -> None:
    op.drop_index("ix_certificates_bundle_no", table_name="certificates")
    op.drop_column("certificates", "bundle_no")
