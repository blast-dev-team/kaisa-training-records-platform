"""inquiries — 교육생 문의(회원·비회원) + 관리자 답변

답변은 문의당 1개라 같은 행에 둔다. 문의자 정보(성명·연락처)는 작성 시점 값을
암호화+blind index 로 남겨, 같은 문의자의 문의를 회원·비회원 구분 없이 묶어 본다.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-11-03
"""

import sqlalchemy as sa

from alembic import op

revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inquiries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "trainee_id",
            sa.Uuid(),
            sa.ForeignKey("trainees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("author_name_encrypted", sa.Text(), nullable=False),
        sa.Column("author_name_hash", sa.String(64), nullable=False),
        sa.Column("author_phone_encrypted", sa.Text(), nullable=True),
        sa.Column("author_phone_hash", sa.String(64), nullable=True),
        sa.Column("author_cert_no", sa.String(100), nullable=True),
        sa.Column("author_email", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column(
            "answered_by",
            sa.Uuid(),
            sa.ForeignKey("admin_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_inquiries_status_created_at", "inquiries", ["status", "created_at"])
    op.create_index("ix_inquiries_user_id", "inquiries", ["user_id"])
    op.create_index(
        "ix_inquiries_author_hashes", "inquiries", ["author_name_hash", "author_phone_hash"]
    )


def downgrade() -> None:
    op.drop_index("ix_inquiries_author_hashes", table_name="inquiries")
    op.drop_index("ix_inquiries_user_id", table_name="inquiries")
    op.drop_index("ix_inquiries_status_created_at", table_name="inquiries")
    op.drop_table("inquiries")
