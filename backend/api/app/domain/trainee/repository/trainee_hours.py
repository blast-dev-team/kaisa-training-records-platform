"""감리원별 사내·외부 교육 시간 합계 — 목록 컬럼·정렬용.

사내/외부는 이력에 저장된 source 가 아니라 **교육기관의 현재 구분**으로 나눈다.
확인서 합계·외부 16시간 한도(external_hours)와 같은 기준이라, 기관 구분을 사내↔외부로
바꾸면 저장값 동기화 여부와 상관없이 다음 조회부터 바로 반영되고 확인서와 어긋나지 않는다.
기관이 사내(internal)가 아니면(외부·미설정·기관 미연결) 외부로 본다.
삭제·취소 이력은 뺀다. 기간 제한 없음(전체 이력).
"""

import uuid
from decimal import Decimal

from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.institution.model import TrainingInstitution
from app.domain.training_record.model import TrainingRecord

HOURS_SORT_KEYS = ("total_hours", "internal_hours", "external_hours")


def hours_by_trainee_select() -> Select:
    is_internal = TrainingInstitution.institution_type == "internal"
    internal = func.coalesce(
        func.sum(case((is_internal, TrainingRecord.total_hours), else_=0)), 0
    )
    total = func.coalesce(func.sum(TrainingRecord.total_hours), 0)
    return (
        select(
            TrainingRecord.trainee_id.label("trainee_id"),
            internal.label("internal_hours"),
            (total - internal).label("external_hours"),
            total.label("total_hours"),
        )
        .select_from(TrainingRecord)
        .outerjoin(TrainingInstitution, TrainingInstitution.id == TrainingRecord.institution_id)
        .where(
            TrainingRecord.deleted_at.is_(None),
            TrainingRecord.completion_status != "canceled",
        )
        .group_by(TrainingRecord.trainee_id)
    )


async def hours_by_trainee(
    db: AsyncSession, trainee_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[Decimal, Decimal]]:
    """감리원 id → (사내 합계, 외부 합계). 이력 없는 감리원은 결과에 없다(호출측에서 0 처리)."""
    if not trainee_ids:
        return {}
    stmt = hours_by_trainee_select().where(TrainingRecord.trainee_id.in_(trainee_ids))
    rows = (await db.execute(stmt)).all()
    return {r.trainee_id: (Decimal(r.internal_hours), Decimal(r.external_hours)) for r in rows}
