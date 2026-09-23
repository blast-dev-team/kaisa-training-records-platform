import uuid
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import name_hash
from app.domain.certificate.model import Certificate


async def find_by_id(db: AsyncSession, certificate_id: uuid.UUID) -> Certificate | None:
    result = await db.execute(
        select(Certificate).where(Certificate.id == certificate_id)
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


async def find_bundle_members(db: AsyncSession, certificate: Certificate) -> list[Certificate]:
    """묶음 확인서의 유효 멤버 — 같은 묶음 번호의 issued 건. 연번 순서 유지.

    유효 멤버가 없으면(전 멤버 superseded·revoked) 빈 리스트 — 호출부가
    단건 fallback 을 한다.
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
