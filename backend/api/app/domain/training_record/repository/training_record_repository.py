import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import ColumnElement, func, or_, select
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
) -> tuple[list[TrainingRecord], int, Decimal]:
    """목록 + 건수 + 시수 합계 — 세 값이 같은 필터 조건을 공유한다 (집합 불일치 방지)."""
    conditions: list[ColumnElement[bool]] = [TrainingRecord.deleted_at.is_(None)]
    if trainee_id:
        conditions.append(TrainingRecord.trainee_id == trainee_id)
    if session_id:
        conditions.append(TrainingRecord.session_id == session_id)
    if source:
        conditions.append(TrainingRecord.source == source)
    if exclude_source:
        conditions.append(TrainingRecord.source != exclude_source)
    if date_from is not None or date_to is not None:
        # 교육 기간이 조회 기간과 겹치는 이력 — 종료 없으면 시작일로 판정
        effective_end = func.coalesce(TrainingRecord.ended_at, TrainingRecord.started_at)
        if date_from is not None:
            conditions.append(effective_end >= date_from)
        if date_to is not None:
            conditions.append(TrainingRecord.started_at <= date_to)
    if completion_status:
        conditions.append(TrainingRecord.completion_status == completion_status)
    if search:
        # 과정명·기관명 스냅샷 + 교육생 성명 (전화는 암호화라 검색 불가)
        pattern = f"%{search}%"
        conditions.append(
            or_(
                TrainingRecord.course_name.ilike(pattern),
                TrainingRecord.institution_name.ilike(pattern),
                TrainingRecord.trainee_id.in_(
                    select(Trainee.id).where(Trainee.name.ilike(pattern))
                ),
            )
        )

    stmt = select(TrainingRecord).where(*conditions)
    total = (
        await db.execute(
            select(func.count()).select_from(TrainingRecord).where(*conditions)
        )
    ).scalar_one()
    hours_sum = (
        await db.execute(
            select(func.coalesce(func.sum(TrainingRecord.total_hours), 0)).where(*conditions)
        )
    ).scalar_one()

    stmt = (
        stmt.order_by(TrainingRecord.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total, hours_sum
