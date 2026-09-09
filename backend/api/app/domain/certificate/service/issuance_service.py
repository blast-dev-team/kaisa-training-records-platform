"""확인서 발급 — certificate_no 채번, 스냅샷, 만료일, 재발급 supersede.

호출자(신청·결제 confirm)가 트랜잭션을 소유한다 — 여기선 commit 하지 않는다.
"""

import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.kst import now_kst
from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.trainee.model import Trainee
from app.domain.training_record.model import TrainingRecord


def _today_key() -> str:
    return now_kst().strftime("%Y%m%d")


async def _next_certificate_no(db: AsyncSession) -> str:
    """`CERT-{yyyymmdd}-{seq}` — 오늘 발급분 최대 seq + 1. 유니크 제약이 최후 방어."""
    prefix = f"CERT-{_today_key()}-"
    result = await db.execute(
        select(func.max(Certificate.certificate_no)).where(
            Certificate.certificate_no.like(f"{prefix}%")
        )
    )
    last = result.scalar_one_or_none()
    seq = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{seq}"


async def issue_certificate(
    db: AsyncSession,
    request: CertificateRequest,
    payment_order_id: uuid.UUID | None = None,
) -> Certificate:
    """신청 스냅샷 기반 발급. 재발급이면 기존 cert 를 superseded 처리."""
    trainee = (
        await db.execute(select(Trainee).where(Trainee.id == request.trainee_id))
    ).scalar_one()
    tr = (
        await db.execute(
            select(TrainingRecord).where(
                TrainingRecord.id == request.training_record_id
            )
        )
    ).scalar_one()

    issued_at = now_kst()
    expires_at = (
        issued_at + timedelta(days=settings.CERTIFICATE_VALID_DAYS)
        if settings.CERTIFICATE_VALID_DAYS > 0
        else None
    )

    certificate = Certificate(
        certificate_no=await _next_certificate_no(db),
        certificate_request_id=request.id,
        trainee_id=trainee.id,
        training_record_id=tr.id,
        payment_order_id=payment_order_id,
        issued_name=trainee.name,
        course_name=tr.course_name,
        institution_name=tr.institution_name,
        total_hours=tr.total_hours,
        completed_hours=tr.completed_hours,
        training_started_at=tr.started_at,
        training_ended_at=tr.ended_at,
        issued_at=issued_at,
        expires_at=expires_at,
        status="issued",
    )
    db.add(certificate)

    # 재발급 — 이전 확인서 무효화
    if request.previous_certificate_id:
        previous = await db.get(Certificate, request.previous_certificate_id)
        if previous is not None and previous.status == "issued":
            previous.status = "superseded"

    request.status = "issued"
    request.issued_at = issued_at
    await db.flush()
    return certificate
