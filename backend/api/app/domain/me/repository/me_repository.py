import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.payment.model import PaymentAttempt, PaymentOrder
from app.domain.training_record.model import TrainingRecord


async def list_member_records(
    db: AsyncSession,
    trainee_id: uuid.UUID | None,
    search: str | None = None,
    ended_from: date | None = None,
    ended_to: date | None = None,
    page: int = 1,
    limit: int = 20,
    all_records: bool = False,
) -> tuple[list[TrainingRecord], int, Decimal]:
    """회원 포털 교육이력 — 본인 이력 + 공용 데모 이력(is_demo).

    데모 이력은 교육생 소속과 무관하게 모든 로그인 회원에게 노출된다.
    목록·건수·시수 합계가 같은 필터 조건을 공유한다 (집합 불일치 방지).
    all_records 는 슈퍼 계정 전용 — 소속 무관 전 회원 이력(미리보기)을 본다.
    """
    conditions: list[ColumnElement[bool]] = [TrainingRecord.deleted_at.is_(None)]
    if not all_records:
        if trainee_id is not None:
            conditions.append(
                or_(
                    TrainingRecord.trainee_id == trainee_id,
                    TrainingRecord.is_demo.is_(True),
                )
            )
        else:
            # 교육생 미연결 신규 회원 — 데모 이력만
            conditions.append(TrainingRecord.is_demo.is_(True))
    if search:
        conditions.append(
            or_(
                TrainingRecord.course_name.ilike(f"%{search}%"),
                TrainingRecord.institution_name.ilike(f"%{search}%"),
            )
        )
    if ended_from:
        conditions.append(TrainingRecord.ended_at >= ended_from)
    if ended_to:
        conditions.append(TrainingRecord.ended_at <= ended_to)

    stmt = select(TrainingRecord).where(*conditions)
    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()
    hours_sum = (
        await db.execute(
            select(func.coalesce(func.sum(TrainingRecord.total_hours), 0)).where(*conditions)
        )
    ).scalar_one()
    stmt = (
        stmt.order_by(
            TrainingRecord.ended_at.desc().nullslast(), TrainingRecord.created_at.desc()
        )
        .offset((page - 1) * limit)
        .limit(limit)
    )
    records = list((await db.execute(stmt)).scalars().all())
    return records, int(total), hours_sum


async def find_downloadable_record(
    db: AsyncSession,
    record_id: uuid.UUID,
    trainee_id: uuid.UUID | None,
    all_records: bool = False,
) -> TrainingRecord | None:
    """다운로드 가능한 이력 — 본인 소속이거나 공용 데모. 타인 소속은 None(404).

    all_records 는 슈퍼 계정 전용 — 소속 무관 조회(미리보기).
    """
    stmt = select(TrainingRecord).where(
        TrainingRecord.id == record_id,
        TrainingRecord.deleted_at.is_(None),
    )
    if not all_records:
        if trainee_id is not None:
            stmt = stmt.where(
                or_(
                    TrainingRecord.trainee_id == trainee_id,
                    TrainingRecord.is_demo.is_(True),
                )
            )
        else:
            stmt = stmt.where(TrainingRecord.is_demo.is_(True))
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_my_certificates(
    db: AsyncSession, trainee_id: uuid.UUID
) -> list[tuple[Certificate, str]]:
    """(확인서, issue_type) — issue_type 읔 신청에서 조인해 가져온다."""
    stmt = (
        select(Certificate, CertificateRequest.issue_type)
        .join(
            CertificateRequest,
            Certificate.certificate_request_id == CertificateRequest.id,
        )
        .where(Certificate.trainee_id == trainee_id)
        .order_by(Certificate.issued_at.desc())
    )
    return [tuple(row) for row in (await db.execute(stmt)).all()]


async def list_my_requests(
    db: AsyncSession, trainee_id: uuid.UUID
) -> list[CertificateRequest]:
    stmt = (
        select(CertificateRequest)
        .where(CertificateRequest.trainee_id == trainee_id)
        .order_by(CertificateRequest.requested_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_my_orders(db: AsyncSession, trainee_id: uuid.UUID) -> list[PaymentOrder]:
    stmt = (
        select(PaymentOrder)
        .where(PaymentOrder.trainee_id == trainee_id)
        .order_by(PaymentOrder.created_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_paid_orders(
    db: AsyncSession,
    trainee_id: uuid.UUID,
    *,
    paid_from: datetime | None = None,
    paid_to: datetime | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[PaymentOrder], int]:
    """결제 내역 — 결제완료·환불 주문만. 결제대기·실패는 내역이 아니다."""
    stmt = select(PaymentOrder).where(
        PaymentOrder.trainee_id == trainee_id,
        PaymentOrder.status.in_(["paid", "refunded"]),
    )
    if status in ("paid", "refunded"):
        stmt = stmt.where(PaymentOrder.status == status)
    if paid_from is not None:
        stmt = stmt.where(PaymentOrder.paid_at >= paid_from)
    if paid_to is not None:
        stmt = stmt.where(PaymentOrder.paid_at < paid_to)

    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()
    stmt = (
        stmt.order_by(PaymentOrder.paid_at.desc().nullslast(), PaymentOrder.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    orders = list((await db.execute(stmt)).scalars().all())
    return orders, int(total)


async def find_certificates_by_orders(
    db: AsyncSession, order_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[Certificate]]:
    """주문별 발급 확인서 — 다건 발급 주문은 한 주문에 N건."""
    if not order_ids:
        return {}
    result = await db.execute(
        select(Certificate)
        .where(Certificate.payment_order_id.in_(order_ids))
        .order_by(Certificate.issued_at.asc())
    )
    grouped: dict[uuid.UUID, list[Certificate]] = {}
    for cert in result.scalars():
        grouped.setdefault(cert.payment_order_id, []).append(cert)
    return grouped


async def find_latest_attempts(
    db: AsyncSession, order_ids: list[uuid.UUID]
) -> dict[uuid.UUID, PaymentAttempt]:
    """주문별 최신 결제 시도 — 결제수단·영수증 URL 출처."""
    if not order_ids:
        return {}
    result = await db.execute(
        select(PaymentAttempt)
        .where(PaymentAttempt.payment_order_id.in_(order_ids))
        .order_by(PaymentAttempt.attempt_no.desc())
    )
    latest: dict[uuid.UUID, PaymentAttempt] = {}
    for attempt in result.scalars():
        latest.setdefault(attempt.payment_order_id, attempt)
    return latest
