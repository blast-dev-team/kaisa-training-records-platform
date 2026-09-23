"""training_records — 문서번호 자동 채번 전환 · 서식번호 폐지

doc_no 를 사용자 자유입력에서 시스템 채번으로 바꾼다.
규칙: `정감 제{YY}-E{NNNN}호` — 연도는 생성 시점 연도 2자리, 순서는 연도별 E0001 리셋.

- 기존 row 도 전부 재번호한다(사용자 결정). 순서는 created_at 연도별 그룹 + 연도 내
  created_at 오름차순 — 번호 순서가 등록 순서를 따르도록.
- form_no 는 폐지(확인서 서식 표기는 고정문 "별지 제31호 서식") — 컬럼 삭제.

Revision ID: d2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-09-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2f3a4b5c6d7"
down_revision: str | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("training_records", "form_no")

    # 재번호 — created_at(KST) 연도별로 그룹, 연도 내 등록 순으로 E0001 부터
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, created_at AT TIME ZONE 'Asia/Seoul' AS kst"
            " FROM training_records ORDER BY created_at"
        )
    ).fetchall()
    seq_by_year: dict[int, int] = {}
    for row_id, kst in rows:
        year = kst.year
        seq_by_year[year] = seq_by_year.get(year, 0) + 1
        doc_no = f"정감 제{year % 100:02d}-E{seq_by_year[year]:04d}호"
        conn.execute(
            sa.text("UPDATE training_records SET doc_no = :v WHERE id = :id"),
            {"v": doc_no, "id": row_id},
        )

    op.alter_column("training_records", "doc_no", existing_type=sa.String(100), nullable=False)
    op.create_unique_constraint("uq_training_records_doc_no", "training_records", ["doc_no"])


def downgrade() -> None:
    # 구 자유입력값은 폐기 결정이라 복원 대상이 아니다 — 제약만 되돌린다
    op.drop_constraint("uq_training_records_doc_no", "training_records", type_="unique")
    op.alter_column("training_records", "doc_no", existing_type=sa.String(100), nullable=True)
    op.add_column(
        "training_records", sa.Column("form_no", sa.String(length=100), nullable=True)
    )
