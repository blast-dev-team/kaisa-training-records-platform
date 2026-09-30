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
) -> tuple[list[tuple[Certificate, int]], int]:
    """발급(묶음) 단위 목록 — 한 발급 이벤트를 묶음번호 하나로 그룹핑한다.

    묶음 멤버 중 대표(연번순 첫 건)와 그룹 크기(포함된 교육내역 수)를 짝지어
    돌려준다. 필터는 멤버 아무나 걸리면 그룹이 노출되고, total 도 행 수가
    아니라 발급건 수다.
    """
    gkey = func.coalesce(Certificate.bundle_no, Certificate.certificate_no)

    def _filtered(stmt):
        if trainee_id:
            stmt = stmt.where(Certificate.trainee_id == trainee_id)
        if status:
            stmt = stmt.where(Certificate.status == status)
        if date_from is not None:
            stmt = stmt.where(Certificate.issued_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Certificate.issued_at < date_to + timedelta(days=1))
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Certificate.certificate_no.ilike(pattern),
                    # 성명은 암호화 저장 — blind index 로 '전체 이름 일치'만 지원
                    Certificate.issued_name_hash == name_hash(search),
                    Certificate.course_name.ilike(pattern),
                )
            )
        return stmt

    grouped = _filtered(
        select(gkey.label("gkey"), func.count().label("cnt")).group_by(gkey)
    ).subquery()
    total = (await db.execute(select(func.count()).select_from(grouped))).scalar_one()

    keys = (
        await db.execute(
            _filtered(select(gkey))
            .group_by(gkey)
            .order_by(func.max(Certificate.issued_at).desc(), gkey)
            .offset((page - 1) * limit)
            .limit(limit)
        )
    )
    keys = keys.scalars().all()
    if not keys:
        return [], total

    rows = (
        await db.execute(
            _filtered(select(Certificate))
            .where(gkey.in_(keys))
            .order_by(Certificate.issued_at, Certificate.certificate_no)
        )
    ).scalars().all()

    by_key: dict[str, list[Certificate]] = {}
    for row in rows:
        by_key.setdefault(row.bundle_no or row.certificate_no, []).append(row)

    # 대표 = 연번순 첫 건 (find_by_doc_no 와 같은 순서 규칙)
    return [
        (members[0], len(members))
        for key in keys
        if (members := by_key.get(key))
    ], total
