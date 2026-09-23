"""문서번호를 교육내역 → 발급 건(확인서)으로 이동

`정감 제{YY}-E{NNNN}호` 문서번호의 소유자를 바꾼다:
- training_records.doc_no 삭제 — 내역은 번호를 갖지 않는다
- certificates.doc_no 신설 — 발급 이벤트(문서/묶음)당 1번, 멤버 전부 동일 값.
  기존 발급분은 bundle_no 그룹별로 발급일 순 백필한다 (발급일 연도 = 번호 연도,
  연도별 E0001 리셋)
- certificate_requests.requested_by nullable 완화 — 어드민 발급은 회원 신청이 아니다

Revision ID: f0a1b2c3d4e5
Revises: e7a8b9c0d1e2
Create Date: 2026-09-23
"""

from collections.abc import Sequence
from datetime import timedelta

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f0a1b2c3d4e5"
down_revision: str | None = "e7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("certificates", sa.Column("doc_no", sa.String(length=100), nullable=True))

    # 백필 — 묶음(bundle_no, 없으면 certificate_no)별로 발급일 순 채번, 멤버 전부 동일 값
    conn = op.get_bind()
    groups = conn.execute(
        sa.text(
            "SELECT COALESCE(bundle_no, certificate_no) AS bundle_key,"
            " MIN(issued_at) AS first_issued"
            " FROM certificates GROUP BY 1 ORDER BY first_issued"
        )
    ).fetchall()
    seq_by_year: dict[int, int] = {}
    for bundle_key, first_issued in groups:
        # issued_at 은 UTC 저장 — KST 연도 기준으로 정규화 (+9h)
        kst = first_issued + timedelta(hours=9)
        year = kst.year
        seq_by_year[year] = seq_by_year.get(year, 0) + 1
        doc_no = f"정감 제{year % 100:02d}-E{seq_by_year[year]:04d}호"
        conn.execute(
            sa.text(
                "UPDATE certificates SET doc_no = :v"
                " WHERE COALESCE(bundle_no, certificate_no) = :k"
            ),
            {"v": doc_no, "k": bundle_key},
        )

    op.drop_constraint(
        "uq_training_records_doc_no", "training_records", type_="unique"
    )
    op.drop_column("training_records", "doc_no")

    op.alter_column(
        "certificate_requests",
        "requested_by",
        existing_type=sa.Uuid(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "certificate_requests",
        "requested_by",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.add_column(
        "training_records",
        sa.Column("doc_no", sa.String(length=100), nullable=True),
    )
    op.drop_column("certificates", "doc_no")
