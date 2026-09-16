import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt_field, mask_phone
from app.core.error_codes import api_error
from app.core.kst import kst_range_end, kst_range_start, now_kst, today_kst
from app.domain.certificate.model import Certificate
from app.domain.certificate.repository import pricing_repository
from app.domain.certificate.service.pricing import select_pricing_rule
from app.domain.me.repository import me_repository as repo
from app.domain.me.schema import (
    CertificatePriceResponse,
    MeProfileResponse,
    MyPaymentHistoryItem,
)
from app.domain.trainee.model import Trainee
from app.domain.training_record.schema import TrainingRecordResponse
from app.domain.user.model import User
from app.integrations import s3

# 데모 이력 다운로드에 공통으로 내려주는 파일 — staging 버킷에 수동 업로드된다
DEMO_PDF_KEY = "demo/training-record-demo.pdf"


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


async def _latest_issued_certs(
    db: AsyncSession, trainee_id: uuid.UUID, record_ids: list[uuid.UUID]
) -> dict[uuid.UUID, Certificate]:
    """이력별 최신 유효 확인서 — 데모 이력 공유 대응 trainee 스코프."""
    if not record_ids:
        return {}
    result = await db.execute(
        select(Certificate)
        .where(
            Certificate.trainee_id == trainee_id,
            Certificate.training_record_id.in_(record_ids),
            Certificate.status == "issued",
        )
        .order_by(Certificate.issued_at.desc())
    )
    certs: dict[uuid.UUID, Certificate] = {}
    for cert in result.scalars():
        certs.setdefault(cert.training_record_id, cert)
    return certs


def _certificate_fields(record, cert: Certificate | None, now, today) -> dict:
    """회원별 발급 상태 산출 — 발급 게이트(_validate_item)와 같은 순서로 판정한다.

    3년 초과·수료 미완료는 기발급 여부와 무관하게 unavailable, 유효 확인서가
    있으면 reissuable(무료 기한 내면 reissue_free_until), 없으면 issuable.
    """
    within_window = not (
        record.started_at is not None
        and record.started_at
        < today - timedelta(days=settings.CERTIFICATE_ISSUE_WINDOW_DAYS)
    )
    if not within_window or record.completion_status != "completed":
        return {"certificate_status": "unavailable"}
    if cert is not None:
        fields: dict = {
            "certificate_status": "reissuable",
            "last_issued_at": cert.issued_at,
        }
        if cert.issued_at is not None:
            free_until = cert.issued_at + timedelta(
                days=settings.CERTIFICATE_REISSUE_FREE_DAYS
            )
            if now <= free_until:
                fields["reissue_free_until"] = free_until
        return fields
    return {"certificate_status": "issuable"}


async def decorate_member_records(
    db: AsyncSession,
    trainee_id: uuid.UUID | None,
    records: list,
) -> list[TrainingRecordResponse]:
    """교육이력 응답에 회원별 확인서 발급 상태를 끼워 넣는다 (목록·상세 공통).

    training_records 에는 발급 상태가 없다 — 데모 이력은 여러 회원이 공유하므로
    상태는 항상 certificates(trainee 스코프)에서 산출한다.
    """
    certs = (
        await _latest_issued_certs(db, trainee_id, [r.id for r in records])
        if trainee_id is not None
        else {}
    )
    now = now_kst()
    today = today_kst()
    items = []
    for record in records:
        response = TrainingRecordResponse.model_validate(record)
        for key, value in _certificate_fields(
            record, certs.get(record.id), now, today
        ).items():
            setattr(response, key, value)
        items.append(response)
    return items


async def list_member_records(
    db: AsyncSession,
    user: User,
    search: str | None = None,
    ended_from_raw: str | None = None,
    ended_to_raw: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[TrainingRecordResponse], int]:
    """회원 포털 교육이력 — 본인 이력 + 공용 데모 이력 + 회원별 발급 상태.

    교육생 미연결 신규 회원은 데모 이력만 본다 (get_current_trainee 403 회피).
    """
    trainee_id: uuid.UUID | None = None
    if user is not None:
        trainee = (
            await db.execute(select(Trainee).where(Trainee.user_id == user.id))
        ).scalar_one_or_none()
        trainee_id = trainee.id if trainee else None
    records, total = await repo.list_member_records(
        db,
        trainee_id,
        search=search,
        ended_from=_ymd(ended_from_raw, "from"),
        ended_to=_ymd(ended_to_raw, "to"),
        page=page,
        limit=limit,
    )
    items = await decorate_member_records(db, trainee_id, records)
    return items, total


async def get_demo_download_url(db: AsyncSession, user: User, record_id: uuid.UUID) -> str:
    """교육이력 다운로드 — 데모 이력은 S3 데모 PDF 로 통일해 내려준다."""
    if not s3.is_s3_configured():
        raise api_error(
            "S3_NOT_CONFIGURED",
            status_code=503,
            message="파일 저장소가 설정되지 않았어요. 관리자에게 문의해 주세요",
        )
    trainee = (
        await db.execute(select(Trainee).where(Trainee.user_id == user.id))
    ).scalar_one_or_none()
    record = await repo.find_downloadable_record(
        db, record_id, trainee.id if trainee else None
    )
    if record is None:
        raise api_error("NOT_FOUND", message="교육이력을 찾을 수 없어요")
    try:
        return s3.presigned_download_url(DEMO_PDF_KEY)
    except RuntimeError as exc:
        raise api_error(
            "S3_ERROR", status_code=502, message="파일을 준비하지 못했어요"
        ) from exc


async def get_my_record(db: AsyncSession, trainee: Trainee, record_id: uuid.UUID):
    record = await repo.find_my_record(db, record_id, trainee.id)
    if record is None:
        raise api_error("NOT_FOUND", message="교육이력을 찾을 수 없어요")
    return record


async def get_member_record_response(
    db: AsyncSession, user: User, record_id: uuid.UUID
) -> TrainingRecordResponse:
    """회원 포털 상세 — 본인/공용 데모 이력 + 회원별 발급 상태. 교육생 미연결도 데모는 본다."""
    trainee = (
        await db.execute(select(Trainee).where(Trainee.user_id == user.id))
    ).scalar_one_or_none()
    record = await repo.find_downloadable_record(
        db, record_id, trainee.id if trainee else None
    )
    if record is None:
        raise api_error("NOT_FOUND", message="교육이력을 찾을 수 없어요")
    (response,) = await decorate_member_records(
        db, trainee.id if trainee else None, [record]
    )
    return response


async def list_my_certificates(db: AsyncSession, trainee: Trainee):
    return await repo.list_my_certificates(db, trainee.id)


async def list_my_requests(db: AsyncSession, trainee: Trainee):
    return await repo.list_my_requests(db, trainee.id)


async def list_my_orders(db: AsyncSession, trainee: Trainee):
    return await repo.list_my_orders(db, trainee.id)


# PortOne 결제수단 타입 → 표기 라벨. 미지원 타입은 원문 노출.
# 원문 형식이 제각각("CARD" · "PaymentMethodEasyPay" · "PaymentMethodType.CARD")이라
# 접두사·구분자를 제거한 뒤 매핑한다.
_METHOD_LABELS = {
    "CARD": "카드",
    "EASYPAY": "간편결제",
    "TRANSFER": "계좌이체",
    "VIRTUALACCOUNT": "가상계좌",
    "MOBILE": "모바일",
    "GIFTCERTIFICATE": "상품권",
}


def _method_label(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.upper().replace("_", "").replace(".", "")
    for prefix in ("PAYMENTMETHODTYPE", "PAYMENTMETHOD"):
        if key.startswith(prefix):
            key = key[len(prefix) :]
            break
    return _METHOD_LABELS.get(key, raw)


async def list_payment_history(
    db: AsyncSession,
    trainee: Trainee,
    *,
    paid_from_raw: str | None = None,
    paid_to_raw: str | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[MyPaymentHistoryItem], int]:
    """회원 결제 내역 — 주문 단위(실제 결제 1건)로 조립.

    확인서 번호·교육명은 발급된 certificates 스냅샷에서, 결제수단·영수증은
    최신 payment_attempts 에서 가져온다. 조회 기간은 KST 하루 경계(반열림).
    """
    if status not in (None, "paid", "refunded"):
        raise api_error(
            "VALIDATION_ERROR", message="status 는 paid 또는 refunded 이어야 해요"
        )
    paid_from = kst_range_start(date_) if (date_ := _ymd(paid_from_raw, "from")) else None
    paid_to = kst_range_end(date_) if (date_ := _ymd(paid_to_raw, "to")) else None

    orders, total = await repo.list_paid_orders(
        db,
        trainee.id,
        paid_from=paid_from,
        paid_to=paid_to,
        status=status,
        page=page,
        limit=limit,
    )
    order_ids = [order.id for order in orders]
    certs_by_order = await repo.find_certificates_by_orders(db, order_ids)
    attempts = await repo.find_latest_attempts(db, order_ids)

    items = []
    for order in orders:
        certs = certs_by_order.get(order.id, [])
        attempt = attempts.get(order.id)
        items.append(
            MyPaymentHistoryItem(
                id=order.id,
                order_no=order.order_no,
                paid_at=order.paid_at,
                certificate_no=certs[0].certificate_no if certs else None,
                certificate_count=len(certs),
                course_name=certs[0].course_name if certs else None,
                method=_method_label(attempt.payment_method if attempt else None),
                receipt_url=attempt.receipt_url if attempt else None,
                amount_krw=order.amount_krw,
                status=order.status,
            )
        )
    return items, total


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
