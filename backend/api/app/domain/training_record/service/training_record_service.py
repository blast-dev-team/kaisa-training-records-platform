import secrets
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.institution.repository import institution_repository as inst_repo
from app.domain.trainee.repository import trainee_repository as trainee_repo
from app.domain.training_record.model import TrainingRecord
from app.domain.training_record.repository import training_record_repository as repo
from app.domain.training_record.schema import TrainingRecordCreate, TrainingRecordUpdate

ALLOWED_SOURCES = {"internal", "external", "legacy_import"}
ALLOWED_COMPLETION = {"in_progress", "completed", "canceled"}


def _record_no() -> str:
    """REC-{yyyymmdd}-{hex6} — 유니크 확률적 채번, unique 제약이 최종 방어."""
    return f"REC-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(3)}"


async def get_record(db: AsyncSession, record_id: uuid.UUID) -> TrainingRecord:
    record = await repo.find_by_id(db, record_id)
    if record is None:
        raise api_error("NOT_FOUND", message="교육이력을 찾을 수 없어요")
    return record


async def list_records(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    source: str | None = None,
    completion_status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[TrainingRecord], int]:
    return await repo.list_records(
        db,
        trainee_id=trainee_id,
        source=source,
        completion_status=completion_status,
        page=page,
        limit=limit,
    )


async def create_record(
    db: AsyncSession, data: TrainingRecordCreate, actor: AdminUser
) -> TrainingRecord:
    """스냅샷 자동 채움 — 마스터 연결 시 과정명·기관명·총시간을 마스터에서 가져온다."""
    if data.source not in ALLOWED_SOURCES:
        raise api_error("VALIDATION_ERROR", message="올바르지 않은 이력 출처예요")
    if data.completion_status not in ALLOWED_COMPLETION:
        raise api_error("VALIDATION_ERROR", message="올바르지 않은 수료 상태예요")

    trainee = await trainee_repo.find_by_id(db, data.trainee_id)
    if trainee is None:
        raise api_error("NOT_FOUND", message="회원을 찾을 수 없어요")

    course = None
    if data.course_id:
        course = await inst_repo.find_course_by_id(db, data.course_id)
        if course is None:
            raise api_error("NOT_FOUND", message="과정을 찾을 수 없어요")
    institution = None
    if data.institution_id:
        institution = await inst_repo.find_institution_by_id(db, data.institution_id)
        if institution is None:
            raise api_error("NOT_FOUND", message="교육기관을 찾을 수 없어요")

    course_name = course.name if course else data.course_name
    institution_name = institution.name if institution else data.institution_name
    if not course_name:
        raise api_error(
            "VALIDATION_ERROR", message="과정명 또는 과정 마스터 연결이 필요해요"
        )
    if not institution_name:
        raise api_error(
            "VALIDATION_ERROR", message="기관명 또는 기관 마스터 연결이 필요해요"
        )

    total_hours = data.total_hours
    if total_hours is None and course is not None:
        total_hours = course.total_hours

    record = TrainingRecord(
        training_record_no=_record_no(),
        trainee_id=data.trainee_id,
        course_id=data.course_id,
        institution_id=data.institution_id,
        course_name=course_name,
        institution_name=institution_name,
        total_hours=total_hours if total_hours is not None else 0,
        completed_hours=data.completed_hours,
        started_at=data.started_at,
        ended_at=data.ended_at,
        source=data.source,
        evidence_file_key=data.evidence_file_key,
        completion_status=data.completion_status,
        completed_at=now_kst() if data.completion_status == "completed" else None,
        memo=data.memo,
        created_by=actor.id,
        updated_by=actor.id,
    )
    db.add(record)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="training_record.created",
        entity_type="training_record",
        entity_id=record.id,
        after={
            "training_record_no": record.training_record_no,
            "trainee_id": str(record.trainee_id),
        },
    )
    await db.commit()
    await db.refresh(record)
    return record


async def update_record(
    db: AsyncSession, record_id: uuid.UUID, data: TrainingRecordUpdate, actor: AdminUser
) -> TrainingRecord:
    record = await get_record(db, record_id)
    updates = data.model_dump(exclude_unset=True)

    if (
        "completion_status" in updates
        and updates["completion_status"] not in ALLOWED_COMPLETION
    ):
        raise api_error("VALIDATION_ERROR", message="올바르지 않은 수료 상태예요")
    # 수료 확정 시각은 최초 completed 진입 시에만 남긴다
    if (
        updates.get("completion_status") == "completed"
        and record.completion_status != "completed"
    ):
        record.completed_at = now_kst()

    for field, value in updates.items():
        setattr(record, field, value)
    record.updated_by = actor.id
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="training_record.updated",
        entity_type="training_record",
        entity_id=record.id,
        after={k: str(v) for k, v in updates.items()},
    )
    await db.commit()
    await db.refresh(record)
    return record


async def delete_record(
    db: AsyncSession, record_id: uuid.UUID, actor: AdminUser
) -> None:
    """소프트딜리트 — deleted_at 만 marking. 발급 이력 정합성 보존."""
    record = await get_record(db, record_id)
    record.deleted_at = now_kst()
    record.updated_by = actor.id
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="training_record.deleted",
        entity_type="training_record",
        entity_id=record.id,
    )
    await db.commit()
