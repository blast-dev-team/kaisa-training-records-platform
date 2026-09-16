"""certificate_requests.payment_order_id — 다건 발급 1주문 지원

다건 발급에서 여러 신청이 하나의 결제 주문을 공유하도록 N:1 링크를 추가하고,
레거시 단건 링크(payment_orders.certificate_request_id)는 nullable 로 완화한다.

Revision ID: b7f2c9a41d3e
Revises: 56231556727b
Create Date: 2026-09-15
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7f2c9a41d3e"
down_revision: str | None = "56231556727b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "certificate_requests",
        sa.Column("payment_order_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_creq_payment_order_id",
        "certificate_requests",
        "payment_orders",
        ["payment_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # 레거시 단건 링크를 새 컬럼으로 백필 — 기존 row 도 relationship 조회 대상이 되게
    op.execute(
        """
        UPDATE certificate_requests AS cr
        SET payment_order_id = po.id
        FROM payment_orders AS po
        WHERE po.certificate_request_id = cr.id
        """
    )
    # 다건 주문은 신청과 1:1이 아니다 — null 허용 (unique 유지, PG는 null 복수 허용)
    op.alter_column(
        "payment_orders",
        "certificate_request_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )


def downgrade() -> None:
    # 되돌리려면 1:1이 다시 강제된다 — 결제 전(not paid) 다건 주문은 제거하고 진행
    op.execute(
        """
        DELETE FROM payment_orders
        WHERE certificate_request_id IS NULL AND status <> 'paid'
        """
    )
    op.alter_column(
        "payment_orders",
        "certificate_request_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.drop_constraint(
        "fk_creq_payment_order_id", "certificate_requests", type_="foreignkey"
    )
    op.drop_column("certificate_requests", "payment_order_id")
