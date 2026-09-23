"""수료증 — 기관 내부/외부 구분 + completion_certificates 테이블

내부(internal) 기관의 수료내역에만 발급되는 수료증. 진위확인은 확인서와
같은 certificate_verification_logs 스트림에 기록한다(확인서와 수료증 참조는
각각 nullable FK — 어느 쪽 문서든 로그 한 줄).

Revision ID: e7a8b9c0d1e2
Revises: d2f3a4b5c6d7
Create Date: 2026-09-23
"""

import sqlalchemy as sa

from alembic import op

revision = "e7a8b9c0d1e2"
down_revision = "d2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "training_institutions",
        sa.Column("institution_type", sa.String(20), nullable=True),
    )
    op.create_table(
        "completion_certificates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("certificate_no", sa.String(30), nullable=False),
        sa.Column(
            "training_record_id",
            sa.Uuid(),
            sa.ForeignKey("training_records.id"),
            nullable=False,
        ),
        sa.Column(
            "trainee_id", sa.Uuid(), sa.ForeignKey("trainees.id"), nullable=False
        ),
        sa.Column("issued_name_encrypted", sa.Text(), nullable=False),
        sa.Column("issued_name_hash", sa.String(64), nullable=False),
        sa.Column("trainee_birth_date", sa.Date(), nullable=True),
        sa.Column("course_name", sa.String(255), nullable=False),
        sa.Column("session_name", sa.String(255), nullable=True),
        sa.Column("institution_name", sa.String(255), nullable=False),
        sa.Column(
            "completed_hours", sa.Numeric(precision=8, scale=2), nullable=False
        ),
        sa.Column("started_at", sa.Date(), nullable=True),
        sa.Column("ended_at", sa.Date(), nullable=True),
        sa.Column(
            "issued_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column("status", sa.String(30), nullable=False, server_default="issued"),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("certificate_no"),
        sa.UniqueConstraint("training_record_id"),
    )
    op.create_index(
        "ix_completion_cert_no_issued_at",
        "completion_certificates",
        ["certificate_no", "issued_at"],
    )
    op.create_index(
        "ix_completion_cert_trainee_issued_at",
        "completion_certificates",
        ["trainee_id", "issued_at"],
    )
    op.add_column(
        "certificate_verification_logs",
        sa.Column(
            "completion_certificate_id",
            sa.Uuid(),
            sa.ForeignKey(
                "completion_certificates.id", ondelete="SET NULL"
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "certificate_verification_logs", "completion_certificate_id"
    )
    op.drop_index(
        "ix_completion_cert_trainee_issued_at", table_name="completion_certificates"
    )
    op.drop_index(
        "ix_completion_cert_no_issued_at", table_name="completion_certificates"
    )
    op.drop_table("completion_certificates")
    op.drop_column("training_institutions", "institution_type")
