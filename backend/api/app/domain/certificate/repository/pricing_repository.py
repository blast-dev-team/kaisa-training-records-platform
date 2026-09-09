import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.certificate.model import CertificatePricingRule


async def find_by_id(
    db: AsyncSession, rule_id: uuid.UUID
) -> CertificatePricingRule | None:
    result = await db.execute(
        select(CertificatePricingRule).where(CertificatePricingRule.id == rule_id)
    )
    return result.scalar_one_or_none()


async def find_rules(
    db: AsyncSession,
    membership_grade_id: uuid.UUID,
    issue_type: str,
) -> list[CertificatePricingRule]:
    """순수함수(select_pricing_rule)에 넘길 후보군 — 활성 규칙만."""
    result = await db.execute(
        select(CertificatePricingRule)
        .where(
            CertificatePricingRule.membership_grade_id == membership_grade_id,
            CertificatePricingRule.issue_type == issue_type,
            CertificatePricingRule.is_active.is_(True),
        )
        .order_by(CertificatePricingRule.valid_from.desc())
    )
    return list(result.scalars().all())


async def list_rules(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    membership_grade_id: uuid.UUID | None = None,
    issue_type: str | None = None,
    is_active: bool | None = None,
) -> tuple[list[CertificatePricingRule], int]:
    stmt = select(CertificatePricingRule)
    count_stmt = select(func.count()).select_from(CertificatePricingRule)
    if membership_grade_id:
        stmt = stmt.where(
            CertificatePricingRule.membership_grade_id == membership_grade_id
        )
        count_stmt = count_stmt.where(
            CertificatePricingRule.membership_grade_id == membership_grade_id
        )
    if issue_type:
        stmt = stmt.where(CertificatePricingRule.issue_type == issue_type)
        count_stmt = count_stmt.where(CertificatePricingRule.issue_type == issue_type)
    if is_active is not None:
        stmt = stmt.where(CertificatePricingRule.is_active.is_(is_active))
        count_stmt = count_stmt.where(CertificatePricingRule.is_active.is_(is_active))

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(CertificatePricingRule.valid_from.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
