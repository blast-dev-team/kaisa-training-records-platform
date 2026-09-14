import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.error_codes import api_error
from app.domain.auth.model import AdminUser
from app.domain.certificate.model import CertificatePricingRule
from app.domain.certificate.repository import pricing_repository as repo
from app.domain.certificate.schema import (
    PricingRuleCreate,
    PricingRuleUpdate,
)
from app.domain.trainee.model import MembershipGrade


async def create_rule(
    db: AsyncSession, data: PricingRuleCreate, actor: AdminUser
) -> CertificatePricingRule:
    if data.issue_type not in ("original", "reissue"):
        raise api_error(
            "VALIDATION_ERROR", message="발급 유형은 original 또는 reissue 이에요"
        )
    if data.price_krw < 0:
        raise api_error("VALIDATION_ERROR", message="가격은 0원 이상이어야 해요")
    if data.valid_to is not None and data.valid_to <= data.valid_from:
        raise api_error("VALIDATION_ERROR", message="종료일은 시작일보다 늦어야 해요")

    grade = (
        await db.execute(
            select(MembershipGrade).where(
                MembershipGrade.id == data.membership_grade_id
            )
        )
    ).scalar_one_or_none()
    if grade is None:
        raise api_error("NOT_FOUND", message="회원등급을 찾을 수 없어요")

    rule = CertificatePricingRule(
        membership_grade_id=data.membership_grade_id,
        issue_type=data.issue_type,
        price_krw=data.price_krw,
        currency=data.currency,
        valid_from=data.valid_from,
        valid_to=data.valid_to,
        is_active=data.is_active,
    )
    db.add(rule)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="pricing_rule.created",
        entity_type="certificate_pricing_rule",
        entity_id=rule.id,
        after={
            "grade_id": str(rule.membership_grade_id),
            "issue_type": rule.issue_type,
            "price_krw": rule.price_krw,
        },
    )
    await db.commit()
    await db.refresh(rule)
    return rule


async def update_rule(
    db: AsyncSession, rule_id: uuid.UUID, data: PricingRuleUpdate, actor: AdminUser
) -> CertificatePricingRule:
    rule = await repo.find_by_id(db, rule_id)
    if rule is None:
        raise api_error("NOT_FOUND", message="가격 규칙을 찾을 수 없어요")

    before = {"price_krw": rule.price_krw, "is_active": rule.is_active}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    if rule.price_krw < 0:
        raise api_error("VALIDATION_ERROR", message="가격은 0원 이상이어야 해요")
    if rule.valid_to is not None and rule.valid_to <= rule.valid_from:
        raise api_error("VALIDATION_ERROR", message="종료일은 시작일보다 늦어야 해요")

    record_audit(
        db,
        actor_admin_id=actor.id,
        action="pricing_rule.updated",
        entity_type="certificate_pricing_rule",
        entity_id=rule.id,
        before=before,
        after={"price_krw": rule.price_krw, "is_active": rule.is_active},
    )
    await db.commit()
    await db.refresh(rule)
    return rule


async def list_rules(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    membership_grade_id: uuid.UUID | None = None,
    issue_type: str | None = None,
    is_active: bool | None = None,
) -> tuple[list[CertificatePricingRule], int]:
    return await repo.list_rules(
        db,
        page=page,
        limit=limit,
        membership_grade_id=membership_grade_id,
        issue_type=issue_type,
        is_active=is_active,
    )
