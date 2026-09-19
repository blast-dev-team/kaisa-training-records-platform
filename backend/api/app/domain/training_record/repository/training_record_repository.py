import uuid
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.trainee.model import Trainee
from app.domain.training_record.model import TrainingRecord


async def find_by_id(db: AsyncSession, record_id: uuid.UUID) -> TrainingRecord | None:
    result = await db.execute(
        select(TrainingRecord).where(
            TrainingRecord.id == record_id, TrainingRecord.deleted_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def list_records(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    session_id: uuid.UUID | None = None,
    source: str | None = None,
    exclude_source: str | None = None,
    completion_status: str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[TrainingRecord], int]:
    stmt = select(TrainingRecord).where(TrainingRecord.deleted_at.is_(None))
    count_stmt = (
        select(func.count())
        .select_from(TrainingRecord)
        .where(TrainingRecord.deleted_at.is_(None))
    )
    if trainee_id:
        stmt = stmt.where(TrainingRecord.trainee_id == trainee_id)
        count_stmt = count_stmt.where(TrainingRecord.trainee_id == trainee_id)
    if session_id:
        stmt = stmt.where(TrainingRecord.session_id == session_id)
        count_stmt = count_stmt.where(TrainingRecord.session_id == session_id)
    if source:
        stmt = stmt.where(TrainingRecord.source == source)
        count_stmt = count_stmt.where(TrainingRecord.source == source)
    if exclude_source:
        stmt = stmt.where(TrainingRecord.source != exclude_source)
        count_stmt = count_stmt.where(TrainingRecord.source != exclude_source)
    if date_from is not None or date_to is not None:
        # 교육 기간이 조회 기간과 겹치는 이력 — 종료 없으면 시작일로 판정
        effective_end = func.coalesce(TrainingRecord.ended_at, TrainingRecord.started_at)
        if date_from is not None:
            stmt = stmt.where(effective_end >= date_from)
            count_stmt = count_stmt.where(effective_end >= date_from)
        if date_to is not None:
            stmt = stmt.where(TrainingRecord.started_at <= date_to)
            count_stmt = count_stmt.where(TrainingRecord.started_at <= date_to)
    if completion_status:
        stmt = stmt.where(TrainingRecord.completion_status == completion_status)
        count_stmt = count_stmt.where(
            TrainingRecord.completion_status == completion_status
        )
    if search:
        # 과정명·기관명 스냅샷 + 교육생 성명 (전화는 암호화라 검색 불가)
        pattern = f"%{search}%"
        cond = or_(
            TrainingRecord.course_name.ilike(pattern),
            TrainingRecord.institution_name.ilike(pattern),
            TrainingRecord.trainee_id.in_(
                select(Trainee.id).where(Trainee.name.ilike(pattern))
            ),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(TrainingRecord.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
