import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import name_hash
from app.core.kst import KST
from app.domain.trainee.model import Trainee
from app.domain.training_record.model import TrainingRecord


async def find_by_id(db: AsyncSession, record_id: uuid.UUID) -> TrainingRecord | None:
    result = await db.execute(
        select(TrainingRecord).where(
            TrainingRecord.id == record_id, TrainingRecord.deleted_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


# 등록순 정렬의 기준 시점 — 이 이전 데이터는 마이그레이션(미러링)으로 유입돼
# created_at 이 일괄 반영되어 실제 등록 순서가 없다. 등록순은 실등록분만 보여준다.
REGISTRATION_SORT_CUTOFF = datetime(2026, 9, 1, tzinfo=KST)


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
    sort: str = "period",
) -> tuple[list[TrainingRecord], int, Decimal]:
    """목록 + 건수 + 시수 합계 — 세 값이 같은 필터 조건을 공유한다 (집합 불일치 방지).

    sort:
    - `period`       수강기간순(기본) — 시작일 최신순. 전체 데이터 대상.
    - `registration` 등록순 — created_at 이 실제 등록 순서인 2026-09 이후
      실등록분만 대상(마이그레이션 데이터는 등록 시각이 일괄 반영이라 제외).
    """
    conditions: list[ColumnElement[bool]] = [TrainingRecord.deleted_at.is_(None)]
    if sort == "registration":
        conditions.append(TrainingRecord.created_at >= REGISTRATION_SORT_CUTOFF)
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
        # 과정명·기관명 스냅샷은 부분 검색, 교육생 성명은 암호화 저장이라
        # blind index 로 '전체 이름 일치'만 지원한다
        pattern = f"%{search}%"
        conditions.append(
            or_(
                TrainingRecord.course_name.ilike(pattern),
                TrainingRecord.institution_name.ilike(pattern),
                TrainingRecord.trainee_id.in_(
                    select(Trainee.id).where(Trainee.name_hash == name_hash(search))
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
        stmt.order_by(
            TrainingRecord.started_at.desc().nullslast(),
            TrainingRecord.created_at.desc(),
        )
        if sort == "period"
        else stmt.order_by(TrainingRecord.created_at.desc())
    )
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total, hours_sum
