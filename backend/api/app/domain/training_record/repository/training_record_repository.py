import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
    source: str | None = None,
    completion_status: str | None = None,
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
    if source:
        stmt = stmt.where(TrainingRecord.source == source)
        count_stmt = count_stmt.where(TrainingRecord.source == source)
    if completion_status:
        stmt = stmt.where(TrainingRecord.completion_status == completion_status)
        count_stmt = count_stmt.where(
            TrainingRecord.completion_status == completion_status
        )

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(TrainingRecord.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
