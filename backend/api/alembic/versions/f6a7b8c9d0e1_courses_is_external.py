"""training_courses.is_external — 외부 교육과정 판별

외부교육수강기록(감리원이 개인적으로 수료한 외부 교육)과 협회 계속교육 과정을
구분한다. 기관은 양쪽을 모두 호스트할 수 있어(한국인터넷진흥원 등 18종 겹침)
판별 속성은 기관이 아니라 과정에 둔다.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-19
"""

import sqlalchemy as sa

from alembic import op

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "training_courses",
        sa.Column(
            "is_external",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("training_courses", "is_external")
