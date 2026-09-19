import uuid
from datetime import date

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.institution.model import (
    CourseSession,
    TrainingCourse,
    TrainingInstitution,
)
from app.domain.training_record.model import TrainingRecord


async def find_by_id(db: AsyncSession, session_id: uuid.UUID) -> CourseSession | None:
    result = await db.execute(
        select(CourseSession).where(CourseSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def list_sessions(
    db: AsyncSession,
    course_id: uuid.UUID | None = None,
    search: str | None = None,
    status: str | None = None,
    today: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[CourseSession], int]:
    """일정 목록 — 과정명·기관명 검색 + 상태(active/ended)·기간(겹침) 필터."""
    stmt = select(CourseSession)
    count_stmt = select(func.count()).select_from(CourseSession)
    if course_id is not None:
        stmt = stmt.where(CourseSession.course_id == course_id)
        count_stmt = count_stmt.where(CourseSession.course_id == course_id)
    if status == "ended":
        # 종료 = 비활성 플래그 또는 종료일(없으면 시작일) 경과
        effective_end = func.coalesce(CourseSession.ended_at, CourseSession.started_at)
        cond = or_(
            CourseSession.is_active.is_(False),
            and_(effective_end.is_not(None), effective_end < today),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    elif status == "active":
        effective_end = func.coalesce(CourseSession.ended_at, CourseSession.started_at)
        cond = and_(
            CourseSession.is_active.is_(True),
            or_(effective_end.is_(None), effective_end >= today),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if date_from is not None or date_to is not None:
        # 교육 기간이 조회 기간과 겹치는 일정 — 종료 없으면 시작일로 판정
        effective_end = func.coalesce(CourseSession.ended_at, CourseSession.started_at)
        if date_from is not None:
            stmt = stmt.where(effective_end >= date_from)
            count_stmt = count_stmt.where(effective_end >= date_from)
        if date_to is not None:
            stmt = stmt.where(CourseSession.started_at <= date_to)
            count_stmt = count_stmt.where(CourseSession.started_at <= date_to)
    if search:
        pattern = f"%{search}%"
        matched_courses = (
            select(TrainingCourse.id)
            .join(
                TrainingInstitution,
                TrainingInstitution.id == TrainingCourse.institution_id,
            )
            .where(
                TrainingCourse.name.ilike(pattern)
                | TrainingInstitution.name.ilike(pattern)
            )
        )
        cond = CourseSession.course_id.in_(matched_courses)
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(
            CourseSession.started_at.desc().nullslast(),
            CourseSession.created_at.desc(),
        )
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def count_records_by_session(
    db: AsyncSession, session_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """일정별 연결된 이력 수 — 목록 배지용."""
    if not session_ids:
        return {}
    result = await db.execute(
        select(TrainingRecord.session_id, func.count())
        .where(
            TrainingRecord.session_id.in_(session_ids),
            TrainingRecord.deleted_at.is_(None),
        )
        .group_by(TrainingRecord.session_id)
    )
    return {sid: cnt for sid, cnt in result.fetchall()}


async def save(db: AsyncSession, session: CourseSession) -> CourseSession:
    db.add(session)
    await db.flush()
    return session


async def commit_refresh(db: AsyncSession, session: CourseSession) -> CourseSession:
    await db.commit()
    await db.refresh(session)
    return session


async def delete(db: AsyncSession, session: CourseSession) -> None:
    await db.delete(session)
    await db.commit()
