"""course_sessions 테이블 — 교육 일정(과정 개설 회차)

과정 마스터(training_courses)에 없던 개설 일정 레벨을 추가한다.
교육이력(training_records)은 이 일정에 교육생을 연결해 생성하며,
구 시스템 EDC_SCHDL_SN 은 schedule_no 로 보존해 이관 데이터 추적에 쓴다.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-18
"""

import sqlalchemy as sa

from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "course_id",
            sa.Uuid(),
            sa.ForeignKey("training_courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("schedule_no", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.Date(), nullable=True),
        sa.Column("ended_at", sa.Date(), nullable=True),
        sa.Column("total_hours", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column(
            "recognized_hours", sa.Numeric(8, 2), nullable=False, server_default="0"
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_sessions_course_id", "course_sessions", ["course_id"])
    op.create_index("ix_sessions_started_at", "course_sessions", ["started_at"])
    op.create_index("ix_sessions_schedule_no", "course_sessions", ["schedule_no"])
    # 일정 ↔ 이력 연결 — 일정별 수강생 역조회용
    op.add_column(
        "training_records",
        sa.Column("session_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_records_session_id",
        "training_records",
        "course_sessions",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_records_session_id", "training_records", ["session_id"])



def downgrade() -> None:
    op.drop_index("ix_records_session_id", table_name="training_records")
    op.drop_constraint("fk_records_session_id", "training_records", type_="foreignkey")
    op.drop_column("training_records", "session_id")
    op.drop_index("ix_sessions_schedule_no", table_name="course_sessions")
    op.drop_index("ix_sessions_started_at", table_name="course_sessions")
    op.drop_index("ix_sessions_course_id", table_name="course_sessions")
    op.drop_table("course_sessions")
