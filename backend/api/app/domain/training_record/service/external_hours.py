"""외부계속교육 등록 한도 — 감리원별 최근 3년 외부교육 합계는 16시간을 넘을 수 없다.

- 외부교육: 교육기관 구분이 사내(internal)가 아닌 교육 전부(외부·미선택·기관 미연결).
  레거시 이관분(source=legacy_import)에 협회·외부가 섞여 있어 source 가 아니라 기관 구분으로 판정한다.
- 최근 3년: 확인서 발급 가능 기간과 같은 창(수강 시작일 ≥ 오늘 − CERTIFICATE_ISSUE_WINDOW_DAYS).
  시작일이 없거나 창 밖인 이력은 발급 대상이 아니므로 합계에서 뺀다.
- 삭제(soft delete)·취소(canceled) 이력은 뺀다.

확인서 합계(발급 문서·진위확인)는 '사내 합계 + min(외부 합계, 16)' 이다 — 한도 도입 전에
16시간을 넘겨 등록된 감리원도 발급은 되고, 행은 그대로 두되 합계만 16시간으로 고정한다.

차단 기준은 '변경으로 합계가 늘었고, 늘어난 합계가 16시간 초과'다 — 이미 16시간을
넘겨 등록돼 있는 기존 감리원도 메모 수정·시간 축소처럼 합계를 늘리지 않는 변경은 할 수 있다.
"""

import uuid
from collections.abc import Iterable
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.error_codes import api_error
from app.core.kst import today_kst
from app.domain.institution.model import TrainingInstitution
from app.domain.training_record.model import TrainingRecord


def max_hours() -> Decimal:
    return Decimal(settings.EXTERNAL_EDUCATION_MAX_HOURS)


def window_start() -> date:
    return today_kst() - timedelta(days=settings.CERTIFICATE_ISSUE_WINDOW_DAYS)


def is_external_type(institution_type: str | None) -> bool:
    """기관 구분 → 외부교육 여부. 사내(internal)만 협회 교육이다."""
    return institution_type != "internal"


def counts_in_window(started_at: date | None) -> bool:
    return started_at is not None and started_at >= window_start()


async def is_external_institution(db: AsyncSession, institution_id: uuid.UUID | None) -> bool:
    if institution_id is None:
        return True
    institution = await db.get(TrainingInstitution, institution_id)
    return is_external_type(institution.institution_type if institution else None)


async def external_hours_by_trainee(
    db: AsyncSession,
    trainee_ids: list[uuid.UUID],
    exclude_record_ids: list[uuid.UUID] | None = None,
) -> dict[uuid.UUID, Decimal]:
    """감리원별 최근 3년 외부교육 합계 — 없는 감리원은 0."""
    result: dict[uuid.UUID, Decimal] = {tid: Decimal(0) for tid in trainee_ids}
    if not trainee_ids:
        return result
    stmt = (
        select(TrainingRecord.trainee_id, func.coalesce(func.sum(TrainingRecord.total_hours), 0))
        .select_from(TrainingRecord)
        .outerjoin(TrainingInstitution, TrainingInstitution.id == TrainingRecord.institution_id)
        .where(
            TrainingRecord.trainee_id.in_(trainee_ids),
            TrainingRecord.deleted_at.is_(None),
            TrainingRecord.completion_status != "canceled",
            TrainingRecord.started_at.is_not(None),
            TrainingRecord.started_at >= window_start(),
            or_(
                TrainingInstitution.id.is_(None),
                TrainingInstitution.institution_type.is_(None),
                TrainingInstitution.institution_type != "internal",
            ),
        )
        .group_by(TrainingRecord.trainee_id)
    )
    if exclude_record_ids:
        stmt = stmt.where(TrainingRecord.id.not_in(exclude_record_ids))
    for trainee_id, hours in (await db.execute(stmt)).all():
        result[trainee_id] = Decimal(hours)
    return result


def format_hours(hours: Decimal) -> str:
    """8.00 → '8', 7.50 → '7.5'"""
    normalized = hours.normalize()
    return format(normalized, "f") if normalized == normalized.to_integral() else str(normalized)


def remaining_hours(current: Decimal) -> Decimal:
    return max(Decimal(0), max_hours() - current)


def exceeded_message(current: Decimal, trainee_name: str | None = None) -> str:
    who = f"{trainee_name} 감리원은 " if trainee_name else ""
    return (
        f"{who}이미 최근 3년 내 등록된 외부교육이 {format_hours(current)}시간이라 등록할 수 없어요 "
        f"(최대 {format_hours(max_hours())}시간, 남은 한도 {format_hours(remaining_hours(current))}시간)"
    )


def exceeded_error(current: Decimal, trainee_name: str | None = None):
    return api_error("EXTERNAL_HOURS_EXCEEDED", message=exceeded_message(current, trainee_name))


def would_exceed(before: Decimal, after: Decimal) -> bool:
    """변경으로 합계가 늘었고 늘어난 합계가 상한을 넘으면 차단."""
    return after > before and after > max_hours()


async def guard_external_increase(
    db: AsyncSession,
    before: dict[uuid.UUID, Decimal],
    trainee_names: dict[uuid.UUID, str] | None = None,
) -> None:
    """변경을 flush 한 뒤 호출 — 감리원별 합계가 늘면서 상한을 넘었으면 차단(커밋 전이라 롤백된다)."""
    await db.flush()
    after = await external_hours_by_trainee(db, list(before))
    for trainee_id, before_hours in before.items():
        if would_exceed(before_hours, after[trainee_id]):
            name = (trainee_names or {}).get(trainee_id)
            raise exceeded_error(before_hours, name)


def document_total_hours(rows: Iterable[tuple[Decimal, bool]]) -> Decimal:
    """확인서 합계 — (시간, 외부여부) 행들 → 사내 합계 + min(외부 합계, 상한)."""
    internal = Decimal(0)
    external = Decimal(0)
    for hours, is_external in rows:
        if is_external:
            external += hours
        else:
            internal += hours
    return internal + min(external, max_hours())


async def external_flags_by_record(
    db: AsyncSession, record_ids: list[uuid.UUID]
) -> dict[uuid.UUID, bool]:
    """이력별 외부교육 여부 — 현재 기관 구분 기준. 기관 미연결·없는 이력은 외부."""
    if not record_ids:
        return {}
    stmt = (
        select(TrainingRecord.id, TrainingInstitution.institution_type)
        .select_from(TrainingRecord)
        .outerjoin(TrainingInstitution, TrainingInstitution.id == TrainingRecord.institution_id)
        .where(TrainingRecord.id.in_(record_ids))
    )
    return {
        record_id: is_external_type(institution_type)
        for record_id, institution_type in (await db.execute(stmt)).all()
    }
