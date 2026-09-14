import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_field, mask_phone
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.certificate.repository import pricing_repository
from app.domain.certificate.service.pricing import select_pricing_rule
from app.domain.me.repository import me_repository as repo
from app.domain.me.schema import (
    CertificatePriceResponse,
    MeProfileResponse,
)
from app.domain.trainee.model import Trainee


async def get_profile(db: AsyncSession, trainee: Trainee) -> MeProfileResponse:
    phone = decrypt_field(trainee.phone_encrypted) if trainee.phone_encrypted else None
    return MeProfileResponse(
        user_id=trainee.user_id,
        trainee_id=trainee.id,
        trainee_no=trainee.trainee_no,
        name=trainee.name,
        email=trainee.email,
        phone_masked=mask_phone(phone) if phone else None,
        grade_name=trainee.grade.name if trainee.grade else None,
        review_status=trainee.review_status,
        last_login_at=trainee.user.last_login_at if trainee.user else None,
    )


def _ymd(value: str | None, field: str) -> date | None:
    """빈값 = 필터 해제(전체). 형식 오류는 400."""
    if value is None or value == "":
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise api_error(
            "VALIDATION_ERROR", message=f"{field} 는 YYYY-MM-DD 형식이어야 해요"
        ) from exc


async def list_my_records(
    db: AsyncSession,
    trainee: Trainee,
    completion_status: str | None = None,
    ended_from_raw: str | None = None,
    ended_to_raw: str | None = None,
):
    return await repo.list_my_records(
        db,
        trainee.id,
        completion_status=completion_status,
        ended_from=_ymd(ended_from_raw, "from"),
        ended_to=_ymd(ended_to_raw, "to"),
    )


async def get_my_record(db: AsyncSession, trainee: Trainee, record_id: uuid.UUID):
    record = await repo.find_my_record(db, record_id, trainee.id)
    if record is None:
        raise api_error("NOT_FOUND", message="교육이력을 찾을 수 없어요")
    return record


async def list_my_certificates(db: AsyncSession, trainee: Trainee):
    return await repo.list_my_certificates(db, trainee.id)


async def list_my_requests(db: AsyncSession, trainee: Trainee):
    return await repo.list_my_requests(db, trainee.id)


async def list_my_orders(db: AsyncSession, trainee: Trainee):
    return await repo.list_my_orders(db, trainee.id)


async def get_certificate_price(
    db: AsyncSession, trainee: Trainee, record_id: uuid.UUID, issue_type: str
) -> CertificatePriceResponse:
    """발급 요청 전 가격 미리보기 — 소유·수료·등급 판별 게이트를 서버에서 선검사."""
    record = await get_my_record(db, trainee, record_id)
    if record.completion_status != "completed":
        raise api_error(
            "VALIDATION_ERROR", message="수료 완료된 이력만 발급 신청할 수 있어요"
        )
    if issue_type not in ("original", "reissue"):
        raise api_error("VALIDATION_ERROR", message="올바르지 않은 발급 유형이에요")
    if trainee.review_status != "approved" or trainee.membership_grade_id is None:
        raise api_error(
            "GRADE_NOT_DETERMINED", message="회원등급 판별이 완료되지 않았어요"
        )

    now = now_kst()
    rules = await pricing_repository.find_rules(
        db, trainee.membership_grade_id, issue_type
    )
    rule = select_pricing_rule(rules, trainee.membership_grade_id, issue_type, now)
    if rule is None:
        raise api_error("PRICING_RULE_NOT_FOUND", message="적용할 가격 규칙이 없어요")

    return CertificatePriceResponse(
        training_record_id=record.id,
        course_name=record.course_name,
        issue_type=issue_type,
        grade_name=trainee.grade.name if trainee.grade else None,
        price_krw=rule.price_krw,
        currency=rule.currency,
    )
