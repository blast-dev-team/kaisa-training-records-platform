"""training_records.form_no / doc_no / supervisor_grade / supervisor_cert_no 추가 — 확인서 표기용 등록 항목

어드민 이력 등록·수정에서 서식번호·문서번호·감리원 등급·감리원증 발급번호를 입력하고,
회원 포털(me) 응답에도 함께 내려준다. 기존 row 는 NULL 유지.

Revision ID: a1b2c3d4e5f6
Revises: e9f0a1b2c3d4
Create Date: 2026-09-17
"""

import sqlalchemy as sa

from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "e9f0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "training_records",
        sa.Column("form_no", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "training_records",
        sa.Column("doc_no", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "training_records",
        sa.Column("supervisor_grade", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "training_records",
        sa.Column("supervisor_cert_no", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("training_records", "supervisor_cert_no")
    op.drop_column("training_records", "supervisor_grade")
    op.drop_column("training_records", "doc_no")
    op.drop_column("training_records", "form_no")
