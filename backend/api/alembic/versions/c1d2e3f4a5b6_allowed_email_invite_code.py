"""admin_allowed_emails.invite_code_hash + invite_expires_at — 관리자 가입 초대 코드

예전엔 화이트리스트(pending)에 이메일만 있으면 누구나 그 이메일로 먼저 가입해
관리자 계정을 가져갈 수 있었다(이메일 소유 검증 없음). 메일 발송 수단이 없으므로
super 가 초대할 때 1회용 코드를 발급해 당사자에게 직접 전달하고, 가입 시 코드를
확인한다. 평문 코드는 저장하지 않는다(sha256).

기존 pending 행은 코드가 없어 가입할 수 없다 — 어드민에서 코드를 재발급한다.

같은 배포에서 이메일 '테스트' 우회 로그인을 제거한다. 그 경로가 만들어 둔
super 계정(test-admin@kaisa.or.kr)의 세션은 최대 7일 살아 있으므로, 계정을
비활성화하고 세션을 지워 즉시 끊는다. (계정 row 자체는 감사로그 참조 때문에 남긴다)

Revision ID: c1d2e3f4a5b6
Revises: f7a8b9c0d1e2
Create Date: 2026-10-24
"""

import sqlalchemy as sa

from alembic import op
from sqlalchemy import text

revision = "c1d2e3f4a5b6"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "admin_allowed_emails",
        sa.Column("invite_code_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "admin_allowed_emails",
        sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        text(
            "DELETE FROM admin_sessions WHERE admin_id IN "
            "(SELECT id FROM admin_users WHERE email = 'test-admin@kaisa.or.kr')"
        )
    )
    op.execute(
        text(
            "UPDATE admin_users SET status = 'disabled' "
            "WHERE email = 'test-admin@kaisa.or.kr'"
        )
    )


def downgrade() -> None:
    op.drop_column("admin_allowed_emails", "invite_expires_at")
    op.drop_column("admin_allowed_emails", "invite_code_hash")
