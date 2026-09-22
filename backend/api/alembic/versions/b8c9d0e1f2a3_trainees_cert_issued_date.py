"""trainees.cert_issued_date — 감리원증 발급일자

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8c9d0e1f2a3"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "trainees",
        sa.Column("cert_issued_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trainees", "cert_issued_date")
