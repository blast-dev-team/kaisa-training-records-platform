import uuid
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import name_hash
from app.domain.certificate.model import Certificate, CertificateRequest


async def find_by_id(db: AsyncSession, certificate_id: uuid.UUID) -> Certificate | None:
    result = await db.execute(
        select(Certificate).where(Certificate.id == certificate_id)
    )
    return result.scalar_one_or_none()


async def find_by_no(db: AsyncSession, certificate_no: str) -> Certificate | None:
    result = await db.execute(
        select(Certificate).where(Certificate.certificate_no == certificate_no)
    )
    return result.scalar_one_or_none()


async def find_by_doc_no(db: AsyncSession, doc_no: str) -> Certificate | None:
    """문서번호(정감 제{YY}-E{NNNN}호)로 조회 — 묶음 멤버 중 대표 1건.

    멤버가 여러 개여도 bundle_no 가 같아 _verify_certificate 의
    find_bundle_members 에서 전체가 회수된다. 대표는 연번순 첫 건.
    """
    result = await db.execute(
        select(Certificate)
        .where(Certificate.doc_no == doc_no)
        .order_by(Certificate.issued_at, Certificate.certificate_no)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def find_latest_bundle_no(db: AsyncSession, certificate: Certificate) -> str | None:
    """재발급 체인을 따라 최종 문서(묶음) 번호 — superseded 조회 안내용.

    previous_certificate_id(신청 FK)로 다음 발급을 찾아 끝까지 간다. 현행
    규칙은 재발급 시 이전본을 revoked 로 폐기하고, superseded 상태는 규칙이
    오가며 만들어진 레거시 row 에만 있다 — 그 번호로 조회할 때만 쓴다.
    """
    current = certificate
    for _ in range(10):
        result = await db.execute(
            select(Certificate)
            .join(
                CertificateRequest,
                Certificate.certificate_request_id == CertificateRequest.id,
            )
            .where(CertificateRequest.previous_certificate_id == current.id)
            .order_by(Certificate.issued_at)
            .limit(1)
        )
        nxt = result.scalar_one_or_none()
        if nxt is None:
            if current is certificate:
                return None
            return current.bundle_no or current.certificate_no
        current = nxt
    return current.bundle_no or current.certificate_no


async def find_bundle_members(db: AsyncSession, certificate: Certificate) -> list[Certificate]:
    """묶음 확인서의 유효 멤버 — 같은 묶음 번호의 issued 건. 연번 순서 유지.

    유효 멤버가 없으면(전 멤버 superseded·revoked) 빈 리스트 — 호출부가
    분기한다.
    """
    if certificate.bundle_no is None:
        return [certificate] if certificate.status == "issued" else []
    result = await db.execute(
        select(Certificate)
        .where(
            Certificate.bundle_no == certificate.bundle_no,
            Certificate.status == "issued",
        )
        .order_by(Certificate.issued_at, Certificate.id)
    )
    return list(result.scalars().all())


async def list_certificates(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Certificate], int]:
    stmt = select(Certificate)
    count_stmt = select(func.count()).select_from(Certificate)
    if trainee_id:
        stmt = stmt.where(Certificate.trainee_id == trainee_id)
        count_stmt = count_stmt.where(Certificate.trainee_id == trainee_id)
    if status:
        stmt = stmt.where(Certificate.status == status)
        count_stmt = count_stmt.where(Certificate.status == status)
    if date_from is not None:
        cond = Certificate.issued_at >= date_from
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if date_to is not None:
        cond = Certificate.issued_at < date_to + timedelta(days=1)
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if search:
        pattern = f"%{search}%"
        cond = or_(
            Certificate.certificate_no.ilike(pattern),
            # 성명은 암호화 저장 — blind index 로 '전체 이름 일치'만 지원
            Certificate.issued_name_hash == name_hash(search),
            Certificate.course_name.ilike(pattern),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(Certificate.issued_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
