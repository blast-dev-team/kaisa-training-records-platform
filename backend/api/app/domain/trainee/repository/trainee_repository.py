import uuid
from datetime import date

from sqlalchemy import func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import name_hash
from app.domain.trainee.model import MembershipGrade, Trainee


async def find_by_id(db: AsyncSession, trainee_id: uuid.UUID) -> Trainee | None:
    result = await db.execute(
        select(Trainee).where(
            Trainee.id == trainee_id, Trainee.deleted_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def find_by_user_id(db: AsyncSession, user_id: uuid.UUID) -> Trainee | None:
    result = await db.execute(
        select(Trainee).where(
            Trainee.user_id == user_id, Trainee.deleted_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def find_by_ids(
    db: AsyncSession, trainee_ids: list[uuid.UUID]
) -> list[Trainee]:
    """일괄 처리용 — 삭제되지 않은 교육생만. 없는 id 는 결과에서 빠진다."""
    if not trainee_ids:
        return []
    result = await db.execute(
        select(Trainee).where(
            Trainee.id.in_(trainee_ids), Trainee.deleted_at.is_(None)
        )
    )
    return list(result.scalars().all())


async def list_trainees(
    db: AsyncSession,
    search: str | None = None,
    review_status: str | None = None,
    grade_id: uuid.UUID | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Trainee], int]:
    """이름/교육번 검색 — 이름·전화번호는 암호화 저장이라 부분 검색 불가 (문서 명시).

    이름은 blind index 로 '전체 이름 일치'만, 번호류는 부분 검색을 지원한다.
    """
    stmt = select(Trainee).where(Trainee.deleted_at.is_(None))
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                Trainee.name_hash == name_hash(search),
                Trainee.trainee_no.ilike(pattern),
                Trainee.cert_no.ilike(pattern),  # 감리원증번호
            )
        )
    if review_status:
        stmt = stmt.where(Trainee.review_status == review_status)
    if grade_id is not None:
        stmt = stmt.where(Trainee.membership_grade_id == grade_id)
    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()
    stmt = (
        stmt.order_by(Trainee.created_at.desc()).offset((page - 1) * limit).limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all()), int(total)


async def list_cert_no_duplicates(
    db: AsyncSession,
) -> list[Trainee]:
    """감리원증번호가 중복인 교육생 — 번호 개명 등으로 발생. 관리자 수동 정리 대상."""
    dup_nos = select(Trainee.cert_no).where(
        Trainee.deleted_at.is_(None),
        Trainee.cert_no.is_not(None),
    ).group_by(Trainee.cert_no).having(func.count() > 1)
    stmt = (
        select(Trainee)
        .where(
            Trainee.deleted_at.is_(None),
            Trainee.cert_no.in_(dup_nos),
        )
        .order_by(Trainee.cert_no.asc(), Trainee.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def find_duplicates_for_import(
    db: AsyncSession,
    cert_nos: list[str],
    name_birth_pairs: list[tuple[str, date]],
) -> list[Trainee]:
    """엑셀 일괄 등록 중복 판별용 — 감리원증번호 일치 or (이름, 생년월일) 일치.

    생년월일 NULL 쌍은 매치될 수 없어(tuple 비교에서 제외) cert_no 로만 잡힌다.
    """
    conditions = []
    if cert_nos:
        conditions.append(Trainee.cert_no.in_(cert_nos))
    if name_birth_pairs:
        conditions.append(
            tuple_(Trainee.name_hash, Trainee.birth_date).in_(
                [(name_hash(n), b) for n, b in name_birth_pairs]
            )
        )
    if not conditions:
        return []
    stmt = select(Trainee).where(Trainee.deleted_at.is_(None), or_(*conditions))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def find_by_identifiers(
    db: AsyncSession,
    names: list[str],
    cert_nos: list[str],
    trainee_nos: list[str],
) -> list[Trainee]:
    """엑셀 대조 매칭용 — 이름·감리원증번호·교육생번호 중 하나라도 일치하는 교육생."""
    conditions = []
    if names:
        conditions.append(Trainee.name_hash.in_([name_hash(n) for n in names]))
    if cert_nos:
        conditions.append(Trainee.cert_no.in_(cert_nos))
    if trainee_nos:
        conditions.append(Trainee.trainee_no.in_(trainee_nos))
    if not conditions:
        return []
    stmt = select(Trainee).where(Trainee.deleted_at.is_(None), or_(*conditions))
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ── 등급 마스터 ────────────────────────────────────────────────────────────────


async def find_grade_by_id(
    db: AsyncSession, grade_id: uuid.UUID
) -> MembershipGrade | None:
    return await db.get(MembershipGrade, grade_id)


async def find_grade_by_code(db: AsyncSession, code: str) -> MembershipGrade | None:
    result = await db.execute(
        select(MembershipGrade).where(MembershipGrade.code == code)
    )
    return result.scalar_one_or_none()


async def find_expired_annual(
    db: AsyncSession, annual_grade_id: uuid.UUID, today
) -> list[Trainee]:
    """기간 지난 연간 회원 — 만료일 당일까지 유효(`< today`).

    1단계: id 만 FOR UPDATE SKIP LOCKED 로 잠가 동시 스윕 간 중복 전환을 막는다
    (Trainee 는 grade 를 joined 로드하므로 엔티티 select 에 직접 걸 수 없다 —
    outer join nullable side 금지). 2단계: 잠긴 id 로 엔티티를 읽는다.
    """
    ids = (
        await db.scalars(
            select(Trainee.id)
            .where(
                Trainee.deleted_at.is_(None),
                Trainee.membership_grade_id == annual_grade_id,
                Trainee.grade_expires_at < today,
            )
            .with_for_update(skip_locked=True)
        )
    ).all()
    if not ids:
        return []
    result = await db.execute(select(Trainee).where(Trainee.id.in_(ids)))
    return list(result.scalars().all())


async def list_grades(
    db: AsyncSession, is_active: bool | None = None
) -> list[MembershipGrade]:
    stmt = select(MembershipGrade)
    if is_active is not None:
        stmt = stmt.where(MembershipGrade.is_active == is_active)
    stmt = stmt.order_by(MembershipGrade.sort_order.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())
