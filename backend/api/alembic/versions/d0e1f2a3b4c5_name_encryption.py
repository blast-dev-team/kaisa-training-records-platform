"""이름 개인정보 암호화 저장 — trainees · users · identity_verifications · certificates

전화번호(phone_encrypted)와 같은 패턴으로 이름을 암호화한다:
- *_name_encrypted  : Fernet 가역 저장 (표시용 — decrypt_field)
- *_name_hash       : HMAC-SHA256 blind index (정확히-일치 검색용 — name_hash)

Fernet 은 비결정적이라 기존 name 컬럼으로 하던 `==`/ilike 검색이 불가능하다.
hash 컬럼이 검색을 대신하고, 부분 검색은 원리적으로 지원하지 않는다.

기존 row 는 Python backfill 로 암호화한다(마이그레이션 안에서 app.core.crypto 사용).
구 평문 컬럼(name 등)은 다음 revision(d1e2f3a4b5c6)에서 즉시 제거한다 —
"이름 암호화 저장" 요구상 평문 원본을 남겨 두면 안 되므로 한 배포에서 함께 나간다.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-09-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.crypto import decrypt_field, name_columns

# revision identifiers, used by Alembic.
revision: str = "d0e1f2a3b4c5"
down_revision: str | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, source column, encrypted target, hash target, encrypted nullable)
_TARGETS = [
    ("trainees", "name", "name_encrypted", "name_hash", False),
    ("users", "name", "name_encrypted", "name_hash", True),
    ("identity_verifications", "verified_name", "verified_name_encrypted",
     "verified_name_hash", True),
    ("certificates", "issued_name", "issued_name_encrypted", "issued_name_hash", False),
]
# 이번 배포에서 NOT NULL 유지 중인 구 평문 컬럼 — nullable 로 풀어야 새 코드 INSERT 가
# 통과한다 (새 코드는 이 컬럼을 안 쓴다). drop 은 다음 배포 마이그레이션에서.
_NULLABLE_NOW = {"trainees", "certificates"}


def _backfill(conn: sa.Connection, table: str, src: str, enc: str, hsh: str) -> None:
    rows = conn.execute(
        sa.text(f"SELECT id, {src} FROM {table} WHERE {src} IS NOT NULL")
    ).fetchall()
    for row_id, value in rows:
        encrypted, hashed = name_columns(value)
        conn.execute(
            sa.text(
                f"UPDATE {table} SET {enc} = :enc, {hsh} = :hsh WHERE id = :id"
            ),
            {"enc": encrypted, "hsh": hashed, "id": row_id},
        )


def upgrade() -> None:
    conn = op.get_bind()

    for table, src, enc, hsh, nullable in _TARGETS:
        op.add_column(table, sa.Column(enc, sa.Text(), nullable=True))
        op.add_column(table, sa.Column(hsh, sa.String(length=64), nullable=True))
        _backfill(conn, table, src, enc, hsh)
        if not nullable:
            # 원본 name 컬럼이 NOT NULL 이므로 backfill 후 전 row 가 채워져 있다
            op.alter_column(table, enc, existing_type=sa.Text(), nullable=False)
        if table in _NULLABLE_NOW:
            # 구 평문 컬럼 해제 — 새 코드는 쓰지 않는다. 값 보존 (다음 배포에 drop)
            op.alter_column(
                table, src, existing_type=sa.String(length=100), nullable=True
            )

    # 검색용 blind index
    op.create_index("ix_trainees_name_hash", "trainees", ["name_hash"])
    op.create_index(
        "ix_certificates_issued_name_hash", "certificates", ["issued_name_hash"]
    )
    # 구 평문 컬럼의 인덱스(ix_trainees_name)는 drop 마이그레이션에서 함께 제거


def downgrade() -> None:
    # downgrades name_encrypted/name_hash — 구 평문 컬럼은 아래에서 복원한다.
    op.drop_index("ix_certificates_issued_name_hash", table_name="certificates")
    op.drop_index("ix_trainees_name_hash", table_name="trainees")

    for table, src, enc, hsh, _nullable in reversed(_TARGETS):
        # 암호문을 복호화해 구 컬럼을 되살린다 (가역 — Fernet)
        conn = op.get_bind()
        rows = conn.execute(
            sa.text(f"SELECT id, {enc} FROM {table} WHERE {enc} IS NOT NULL")
        ).fetchall()
        for row_id, value in rows:
            conn.execute(
                sa.text(f"UPDATE {table} SET {src} = :v WHERE id = :id"),
                {"v": decrypt_field(value), "id": row_id},
            )
        op.drop_column(table, hsh)
        op.drop_column(table, enc)
        if table in _NULLABLE_NOW:
            op.alter_column(
                table, src, existing_type=sa.String(length=100), nullable=False
            )
