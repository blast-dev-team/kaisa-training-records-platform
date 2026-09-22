"""회차명 마스터 + 과정 회차명 참조 + 교육생 감리원증번호

- session_names: 회차명 마스터 — 과정 등록 시 회차명·과정명 분리 입력
- training_courses.session_name_id: 회차명 참조 (SET NULL)
- trainees.cert_no: 감리원증번호 (구 시스템 감리원추가 E열)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-09-18
"""

import sqlalchemy as sa

from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_names",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
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
    op.add_column(
        "training_courses",
        sa.Column("session_name_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_courses_session_name_id",
        "training_courses",
        "session_names",
        ["session_name_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column("trainees", sa.Column("cert_no", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("trainees", "cert_no")
    op.drop_constraint("fk_courses_session_name_id", "training_courses", type_="foreignkey")
    op.drop_column("training_courses", "session_name_id")
    op.drop_table("session_names")
