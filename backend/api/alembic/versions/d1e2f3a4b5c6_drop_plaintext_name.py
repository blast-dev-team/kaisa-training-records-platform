"""구 평문 이름 컬럼 drop — trainees.name · users.name · verified_name · issued_name

d0e1f2a3b4c5 에서 암호화 백필이 끝났으므로 평문 원본을 제거한다.
"이름 암호화 저장" 요구사항상 암호문 옆에 평문 컬럼이 남아 있으면 미충족.

롤백(downgrade): d0e1f2a3b4c5 와 달리 컬럼을 새로 만들어야 하므로 add_column 부터 하고,
암호문을 복호화해 되살린다(Fernet 가역 — 데이터 소실 없음).

Revision ID: d1e2f3a4b5c6
Revises: d0e1f2a3b4c5
Create Date: 2026-09-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, plaintext column, encrypted column, plaintext was NOT NULL)
_TARGETS = [
    ("trainees", "name", "name_encrypted", True),
    ("users", "name", "name_encrypted", False),
    ("identity_verifications", "verified_name", "verified_name_encrypted", False),
    ("certificates", "issued_name", "issued_name_encrypted", True),
]


def upgrade() -> None:
    op.drop_index("ix_trainees_name", table_name="trainees")
    for table, src, _enc, _was_not_null in _TARGETS:
        op.drop_column(table, src)


def downgrade() -> None:
    # 암호문에서 평문을 복원 — 컬럼을 되살린 뒤 되우고 제약을 되돌린다
    # 함수 안 임포트 — alembic heads 등 읽기 명령이 CRYPTO_KEY 없이 돌아가게
    from app.core.crypto import decrypt_field

    for table, src, enc, was_not_null in reversed(_TARGETS):
        op.add_column(table, sa.Column(src, sa.String(length=100), nullable=True))
        conn = op.get_bind()
        rows = conn.execute(
            sa.text(f"SELECT id, {enc} FROM {table} WHERE {enc} IS NOT NULL")
        ).fetchall()
        for row_id, value in rows:
            conn.execute(
                sa.text(f"UPDATE {table} SET {src} = :v WHERE id = :id"),
                {"v": decrypt_field(value), "id": row_id},
            )
        if was_not_null:
            op.alter_column(
                table, src, existing_type=sa.String(length=100), nullable=False
            )
    op.create_index("ix_trainees_name", "trainees", ["name"])
