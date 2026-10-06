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
    supervisor_grade: str | None = None,
    birth_date: date | None = None,
    sort_key: str | None = None,
    sort_order: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Trainee], int]:
    """이름/교육번/이메일 검색 — 이름·전화번호는 암호화 저장이라 부분 검색 불가 (문서 명시).

    이름은 blind index 로 '전체 이름 일치'만, 번호·이메일은 부분 검색을 지원한다.
    supervisor_grade 는 'none' sentinel 로 미정(NULL) 필터를 지원한다.
    sort_key 는 'grade_expires_at' | 'created_at' | 'updated_at' — service 에서
    화이트리스트 검증된다. grade_expires_at 정렬 시 NULL 은 마지막.
    """
    stmt = select(Trainee).where(Trainee.deleted_at.is_(None))
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                Trainee.name_hash == name_hash(search),
                Trainee.trainee_no.ilike(pattern),
                Trainee.cert_no.ilike(pattern),  # 감리원증번호
                Trainee.senior_cert_no.ilike(pattern),  # 수석감리원증번호
                Trainee.email.ilike(pattern),
            )
        )
    if review_status:
        stmt = stmt.where(Trainee.review_status == review_status)
    if grade_id is not None:
        stmt = stmt.where(Trainee.membership_grade_id == grade_id)
    if supervisor_grade == "none":
        stmt = stmt.where(Trainee.supervisor_grade.is_(None))
    elif supervisor_grade:
        stmt = stmt.where(Trainee.supervisor_grade == supervisor_grade)
    if birth_date is not None:
        stmt = stmt.where(Trainee.birth_date == birth_date)
    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()
    # id 까지 정렬해야 페이지가 흔들리지 않는다 — 이관 데이터는 created_at 이
    # 일괄 반영이라 같은 값이 수천 건이다. tiebreaker 없으면 LIMIT/OFFSET 사이에
    # 같은 행이 페이지를 넘어 중복·누락된다(다중선택 유지와 조합하면 유령 선택 버그).
    order_by = [Trainee.created_at.desc(), Trainee.id.desc()]
    if sort_order in ("asc", "desc"):
        if sort_key == "grade_expires_at":
            primary = (
                Trainee.grade_expires_at.asc().nulls_last()
                if sort_order == "asc"
                else Trainee.grade_expires_at.desc().nulls_last()
            )
            order_by = [primary, *order_by]
        elif sort_key in ("created_at", "updated_at"):
            col = Trainee.created_at if sort_key == "created_at" else Trainee.updated_at
            order_by = [col.asc() if sort_order == "asc" else col.desc(), Trainee.id.desc()]
    stmt = (
        stmt.order_by(*order_by)
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all()), int(total)


async def list_supervisor_grades(db: AsyncSession) -> list[str]:
    """등록된 감리원 등급 distinct — 필터 옵션용. 미정(NULL)은 프론트가 '미정' 옵션으로 붙인다."""
    result = await db.execute(
        select(Trainee.supervisor_grade)
        .where(
            Trainee.deleted_at.is_(None),
            Trainee.supervisor_grade.is_not(None),
        )
        .distinct()
        .order_by(Trainee.supervisor_grade.asc())
    )
    return [row[0] for row in result.all()]


async def list_cert_no_duplicates(
    db: AsyncSession,
) -> list[Trainee]:
    """감리원증번호·수석감리원증번호가 중복인 교육생 — 관리자 수동 정리 대상.

    두 번호는 자격번호라 각각 고유여야 한다. 교육생 하나가 양쪽 번호를 다 가지는
    것은 정상(승격)이라, UNION 으로 두 번호 축을 각각 검사한다.
    """
    cert_dup = (
        select(Trainee.cert_no.label("no"))
        .where(Trainee.deleted_at.is_(None), Trainee.cert_no.is_not(None))
        .group_by(Trainee.cert_no)
        .having(func.count() > 1)
    )
    senior_dup = (
        select(Trainee.senior_cert_no.label("no"))
        .where(Trainee.deleted_at.is_(None), Trainee.senior_cert_no.is_not(None))
        .group_by(Trainee.senior_cert_no)
        .having(func.count() > 1)
    )
    stmt = (
        select(Trainee)
        .where(
            Trainee.deleted_at.is_(None),
            or_(
                Trainee.cert_no.in_(cert_dup.scalar_subquery()),
                Trainee.senior_cert_no.in_(senior_dup.scalar_subquery()),
            ),
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

    번호는 감리원증·수석감리원증 양쪽과 비교한다 — 자격번호는 축과 무관하게 고유.
    생년월일 NULL 쌍은 매치될 수 없어(tuple 비교에서 제외) cert_no 로만 잡힌다.
    """
    conditions = []
    if cert_nos:
        conditions.append(
            or_(Trainee.cert_no.in_(cert_nos), Trainee.senior_cert_no.in_(cert_nos))
        )
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


async def find_by_birth_dates(
    db: AsyncSession, birth_dates: list[date]
) -> list[Trainee]:
    """등급 일괄 적용 매칭용 — 생년월일만 일치하는 교육생.

    이름이 오타인 행(전치·1글자 차이)을 생년월일로 후보를 찾아 제안하기 위해 쓴다.
    """
    if not birth_dates:
        return []
    stmt = select(Trainee).where(
        Trainee.deleted_at.is_(None), Trainee.birth_date.in_(birth_dates)
    )
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
