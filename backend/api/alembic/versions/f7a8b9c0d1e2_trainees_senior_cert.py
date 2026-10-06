"""trainees.senior_cert_no + senior_cert_issued_date — 수석감리원증번호 이원화

승격 시 새 감리원증 번호를 부여받으므로 감리원증번호(cert_no)와
수석감리원증번호(senior_cert_no)를 동시 보유한다. 기존 단일 cert_no 는
승격 시 덮어써지는 문제가 있었다.

supervisor_grade 도 자유 문자열에서 enum 값(감리원/수석감리원)으로 정규화한다 —
'수석 감리원'(띄어쓰기) 같은 변종이 확인서 표기를 갈랐다. 이후 저장 시점부터는
번호 유무에서 파생된다(service 파생 규칙). 기존 값은 재파생하지 않는다.

Revision ID: f7a8b9c0d1e2
Revises: b1c2d3e4f5a6
Create Date: 2026-10-01
"""

import sqlalchemy as sa

from alembic import op
from sqlalchemy import text

revision = "f7a8b9c0d1e2"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trainees",
        sa.Column("senior_cert_no", sa.String(100), nullable=True),
    )
    op.add_column(
        "trainees",
        sa.Column("senior_cert_issued_date", sa.Date(), nullable=True),
    )

    # 기존 등급 표기 정규화 — 공백 제거 후 enum 값과 일치하는 변종만 매핑.
    # 그 외 값(테스트 더미 등)은 그대로 둔다 — 저장 시점 파생 규칙이 정리한다
    conn = op.get_bind()
    for normalized in ("감리원", "수석감리원"):
        conn.execute(
            text(
                "UPDATE trainees SET supervisor_grade = :normalized"
                " WHERE supervisor_grade IS NOT NULL"
                " AND replace(supervisor_grade, ' ', '') = :normalized"
            ),
            {"normalized": normalized},
        )


def downgrade() -> None:
    op.drop_column("trainees", "senior_cert_issued_date")
    op.drop_column("trainees", "senior_cert_no")
