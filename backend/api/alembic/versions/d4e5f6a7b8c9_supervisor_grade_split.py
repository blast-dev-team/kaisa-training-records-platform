"""감리원 등급을 회원등급에서 분리 — trainees.supervisor_grade

회원등급(membership_grades)은 결제 단가 체계(일반 3,000 / 평생 1,800 / 연간 1,800).
감리원 등급(감리원 / 수석감리원)은 확인서 표기용 속성으로 trainees.supervisor_grade 에.
기존 감리원/수석감리원 등급으로 배정된 교육생은 supervisor_grade 로 값을 옮기고
회원등급은 일반으로 재배정한다.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-18
"""

import sqlalchemy as sa

from alembic import op
from sqlalchemy import text

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None

# 회원등급 마스터 원천 — 결제 단가 체계
GRADES = [
    ("general", "일반", 1, 3000),
    ("lifetime", "평생", 2, 1800),
    ("annual", "연간", 3, 1800),
]
# 회원등급이 아닌 감리원 등급 코드 — 값은 trainees.supervisor_grade 로 이동
SUPERVISOR_GRADE_CODES = ("supervisor", "senior_supervisor")


def upgrade() -> None:
    op.add_column("trainees", sa.Column("supervisor_grade", sa.String(50), nullable=True))

    conn = op.get_bind()
    for code, name, sort_order, price in GRADES:
        conn.execute(
            text(
                "INSERT INTO membership_grades (id, code, name, sort_order, price_krw, is_active)"
                " VALUES (gen_random_uuid(), :code, :name, :sort_order, :price, true)"
                " ON CONFLICT (code) DO UPDATE SET name = :name, price_krw = :price"
            ),
            {"code": code, "name": name, "sort_order": sort_order, "price": price},
        )
    general_id = conn.execute(
        text("SELECT id FROM membership_grades WHERE code = 'general'")
    ).scalar_one()

    # 감리원/수석감리원 등급 → supervisor_grade 로 값 이동 + 회원등급 일반 재배정
    for code in SUPERVISOR_GRADE_CODES:
        row = conn.execute(
            text("SELECT id, name FROM membership_grades WHERE code = :code"),
            {"code": code},
        ).fetchone()
        if row is None:
            continue
        grade_id, grade_name = row
        conn.execute(
            text(
                "UPDATE trainees SET supervisor_grade = :grade_name"
                " WHERE membership_grade_id = :grade_id"
                " AND (supervisor_grade IS NULL OR supervisor_grade = '')"
            ),
            {"grade_name": grade_name, "grade_id": grade_id},
        )
        conn.execute(
            text(
                "UPDATE trainees SET membership_grade_id = :general_id"
                " WHERE membership_grade_id = :grade_id"
            ),
            {"general_id": general_id, "grade_id": grade_id},
        )
        # 발급 신청 이력이 참조하면 남긴다(FK RESTRICT) — 아니면 삭제
        referenced = conn.execute(
            text(
                "SELECT 1 FROM certificate_requests WHERE membership_grade_id = :id LIMIT 1"
            ),
            {"id": grade_id},
        ).fetchone()
        if referenced is None:
            conn.execute(
                text("DELETE FROM membership_grades WHERE id = :id"), {"id": grade_id}
            )
        else:
            conn.execute(
                text("UPDATE membership_grades SET is_active = false WHERE id = :id"),
                {"id": grade_id},
            )


def downgrade() -> None:
    op.drop_column("trainees", "supervisor_grade")
