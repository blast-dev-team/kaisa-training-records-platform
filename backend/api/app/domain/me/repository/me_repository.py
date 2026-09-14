import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.payment.model import PaymentOrder
from app.domain.training_record.model import TrainingRecord


async def find_my_record(
    db: AsyncSession, record_id: uuid.UUID, trainee_id: uuid.UUID
) -> TrainingRecord | None:
    """본인 이력만 — 타인 id 는 404 처리를 위해 None 반환."""
    result = await db.execute(
        select(TrainingRecord).where(
            TrainingRecord.id == record_id,
            TrainingRecord.trainee_id == trainee_id,
            TrainingRecord.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def list_my_records(
    db: AsyncSession,
    trainee_id: uuid.UUID,
    completion_status: str | None = None,
    ended_from: date | None = None,
    ended_to: date | None = None,
) -> list[TrainingRecord]:
    stmt = select(TrainingRecord).where(
        TrainingRecord.trainee_id == trainee_id,
        TrainingRecord.deleted_at.is_(None),
    )
    if completion_status:
        stmt = stmt.where(TrainingRecord.completion_status == completion_status)
    if ended_from:
        stmt = stmt.where(TrainingRecord.ended_at >= ended_from)
    if ended_to:
        stmt = stmt.where(TrainingRecord.ended_at <= ended_to)
    stmt = stmt.order_by(
        TrainingRecord.ended_at.desc().nullslast(), TrainingRecord.created_at.desc()
    )
    return list((await db.execute(stmt)).scalars().all())


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
