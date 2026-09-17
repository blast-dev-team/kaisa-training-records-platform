"""확인서 발급 — certificate_no 채번, 스냅샷, 만료일, 재발급 supersede.

호출자(신청·결제 confirm)가 트랜잭션을 소유한다 — 여기선 commit 하지 않는다.
"""

import uuid
from datetime import timedelta

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.trainee.model import Trainee
from app.domain.training_record.model import TrainingRecord


def _today_key() -> str:
    return now_kst().strftime("%Y%m%d")


async def _next_certificate_no(db: AsyncSession) -> str:
    """`CERT-{yyyymmdd}-{seq}` — 오늘 발급분 최대 seq + 1. 유니크 제약이 최후 방어.

    seq 는 문자열이 아닌 숫자로 비교한다 — VARCHAR max 는 사전순이라
    'CERT-...-9' 이 'CERT-...-10' 보다 크게 잡혀 10 이후 채번이 영원히 겹친다.
    """
    prefix = f"CERT-{_today_key()}-"
    seq_part = cast(func.split_part(Certificate.certificate_no, "-", 3), Integer)
    result = await db.execute(
        select(func.max(seq_part)).where(
            Certificate.certificate_no.like(f"{prefix}%")
        )
    )
    last = result.scalar_one_or_none()
    return f"{prefix}{(last or 0) + 1}"


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

    certificate: Certificate | None = None
    # 채번 경합 방어 — 동시 confirm 이 같은 seq 를 쓰면 unique 위반이라
    # 세이브포인트로 이번 삽입만 롤백하고 번호를 다시 따낸다 (유니크 제약이 최후 방어)
    # add 는 반드시 begin_nested 안에서 — 밖에 두면 실패 시 세션 전체가
    # rollback 대기 상태가 돼 이후 쿼리가 PendingRollbackError 로 깨진다
    for _ in range(5):
        try:
            async with db.begin_nested():
                candidate = Certificate(
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
                db.add(candidate)
                await db.flush()
        except IntegrityError:
            # 같은 요청의 동시 confirm — 먼저 커밋한 확인서가 있으면 그것을 채택한다 (멱등)
            existing = (
                await db.execute(
                    select(Certificate).where(
                        Certificate.certificate_request_id == request.id
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                certificate = existing
                break
            # 아니면 번호 충돌 — 재채번 후 재시도
            continue
        certificate = candidate
        break
    if certificate is None:
        raise api_error(
            "CERT_NO_GENERATION_FAILED",
            status_code=500,
            message="확인서 번호 발급에 실패했어요. 잠시 후 다시 시도해 주세요",
        )

    # 재발급 — 이전 확인서 무효화
    if request.previous_certificate_id:
        previous = await db.get(Certificate, request.previous_certificate_id)
        if previous is not None and previous.status == "issued":
            previous.status = "superseded"

    request.status = "issued"
    request.issued_at = issued_at
    await db.flush()
    return certificate
