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


def format_doc_no(seq: int, yy: str | None = None) -> str:
    """확인서 문서번호 규칙 — `정감 제{YY}-E{NNNN}호`. 연도는 발급 시점 2자리,
    순서는 연도별 E0001 리셋. 번호의 단위는 발급 이벤트(문서)다."""
    if yy is None:
        yy = now_kst().strftime("%y")
    return f"정감 제{yy}-E{seq:04d}호"


async def next_doc_seq(db: AsyncSession, yy: str | None = None) -> int:
    """해당 연도의 다음 문서번호 순서 — 규칙 형식 확인서의 최대 NNNN + 1.

    seq 는 숫자로 비교한다 — VARCHAR max 는 사전순이라 E9 > E10 이 된다.
    """
    if yy is None:
        yy = now_kst().strftime("%y")
    prefix = f"정감 제{yy}-E"
    # split_part('-') 2번째 = 'E0001호' → E·호 떼고 숫자만 캐스트
    seq_part = cast(
        func.replace(
            func.replace(func.split_part(Certificate.doc_no, "-", 2), "E", ""),
            "호",
            "",
        ),
        Integer,
    )
    last = (
        await db.execute(
            select(func.max(seq_part)).where(Certificate.doc_no.like(f"{prefix}%"))
        )
    ).scalar_one_or_none()
    return (last or 0) + 1


async def issue_certificate(
    db: AsyncSession,
    request: CertificateRequest,
    payment_order_id: uuid.UUID | None = None,
    doc_no: str | None = None,
) -> Certificate:
    """신청 스냅샷 기반 발급. 재발급이면 기존 cert 를 superseded 처리.

    doc_no(문서번호)는 발급 이벤트당 1회 채번해 호출부가 넣어 준다 — 묶음 멤버가
    같은 값을 갖는다. 재발급은 문서 구성이 다르므로 새 번호를 받는다.
    """
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
                    doc_no=doc_no,
                    certificate_request_id=request.id,
                    trainee_id=trainee.id,
                    training_record_id=tr.id,
                    payment_order_id=payment_order_id,
                    # 발급 시점 성명 스냅샷 — 교육생 row 의 암호문·해시를 그대로 복사
                    issued_name_encrypted=trainee.name_encrypted,
                    issued_name_hash=trainee.name_hash,
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


def assign_bundle_no(certificates: list[Certificate]) -> None:
    """한 발급 이벤트의 확인서들을 묶음 확인서 1건으로 묶는다.

    묶음 번호는 별도 채번 없이 첫 확인서의 certificate_no 를 쓴다 —
    표시 번호 = 첫 확인서 번호 = 묶음 번호 라 결제내역 등 기존 표기가 그대로 맞는다.
    단건 발급도 묶음 1건으로 만들어 이후 경로(진위확인·조회)를 단일화한다.
    """
    if not certificates:
        return
    bundle_no = certificates[0].certificate_no
    for certificate in certificates:
        certificate.bundle_no = bundle_no
