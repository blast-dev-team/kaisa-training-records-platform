"""admin_sessions_table

관리자 세션을 in-memory 에서 DB 로 이동 — BE 재배포(compose 재시작)마다
관리자 전원이 로그아웃되는 문제 해결 (2026-09-16). user_sessions 과 동일
구조, FK 만 admin_users 를 가리킨다.

Revision ID: 63cbf118cb75
Revises: c4d5e6f7a8b9
Create Date: 2026-09-17 00:22:03.491342
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63cbf118cb75'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'admin_sessions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column(
            'admin_id',
            sa.Uuid(),
            sa.ForeignKey('admin_users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index(
        'ix_admin_sessions_admin_id', 'admin_sessions', ['admin_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_admin_sessions_admin_id', table_name='admin_sessions')
    op.drop_table('admin_sessions')
