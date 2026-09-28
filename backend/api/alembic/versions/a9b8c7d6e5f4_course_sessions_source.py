"""course_sessions.source — 일정 단위 내역 구분(사내/외부)

일정 등록 시 '외부 교육' 체크 상태를 저장한다. 감리원 연결로 생성되는
교육이력이 이 값을 source 로 가져 일정으로 만든 내역도 외부로 구분된다.
기존 일정은 전부 internal 로 백필 — 기존 연결 이력도 source='internal' 이었다.

Revision ID: a9b8c7d6e5f4
Revises: f0a1b2c3d4e5
Create Date: 2026-09-28
"""

import sqlalchemy as sa

from alembic import op

revision = "a9b8c7d6e5f4"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "course_sessions",
        sa.Column(
            "source",
            sa.String(length=20),
            nullable=False,
            server_default="internal",
        ),
    )


def downgrade() -> None:
    op.drop_column("course_sessions", "source")
