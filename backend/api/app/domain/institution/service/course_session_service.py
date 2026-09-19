import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.error_codes import api_error
from app.core.kst import now_kst, today_kst
from app.domain.auth.model import AdminUser
from app.domain.institution.model import CourseSession, TrainingCourse
from app.domain.institution.repository import (
    course_session_repository as session_repo,
)
from app.domain.institution.schema import SessionCreate, SessionUpdate
from app.domain.trainee.model import Trainee
from app.domain.training_record.model import TrainingRecord
from app.domain.training_record.service.training_record_service import _record_no


async def get_session(db: AsyncSession, session_id: uuid.UUID) -> CourseSession:
    session = await session_repo.find_by_id(db, session_id)
    if session is None:
        raise api_error("NOT_FOUND", message="교육 일정을 찾을 수 없어요")
    return session


async def list_sessions(
    db: AsyncSession,
    course_id: uuid.UUID | None = None,
    search: str | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[CourseSession], int, dict[uuid.UUID, int]]:
    sessions, total = await session_repo.list_sessions(
        db,
        course_id=course_id,
        search=search,
        status=status,
        today=today_kst(),
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )
    counts = await session_repo.count_records_by_session(
        db, [s.id for s in sessions]
    )
    return sessions, total, counts


async def count_records_for_sessions(
    db: AsyncSession, session_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    return await session_repo.count_records_by_session(db, session_ids)


async def create_session(
    db: AsyncSession, data: SessionCreate, actor: AdminUser
) -> CourseSession:
    course = await db.get(TrainingCourse, data.course_id)
    if course is None:
        raise api_error("NOT_FOUND", message="과정을 찾을 수 없어요")
    if data.started_at and data.ended_at and data.ended_at < data.started_at:
        raise api_error(
            "VALIDATION_ERROR", message="종료일이 시작일보다 앞설 수 없어요"
        )
    session = await session_repo.save(db, CourseSession(**data.model_dump()))
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="course_session.created",
        entity_type="course_session",
        entity_id=session.id,
        after={"course_id": str(course.id), "started_at": str(session.started_at)},
    )
    await db.commit()
    await db.refresh(session)
    return session


async def update_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    data: SessionUpdate,
    actor: AdminUser,
) -> CourseSession:
    session = await get_session(db, session_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    if session.started_at and session.ended_at and session.ended_at < session.started_at:
        raise api_error(
            "VALIDATION_ERROR", message="종료일이 시작일보다 앞설 수 없어요"
        )
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="course_session.updated",
        entity_type="course_session",
        entity_id=session.id,
    )
    return await session_repo.commit_refresh(db, session)


async def delete_session(
    db: AsyncSession, session_id: uuid.UUID, actor: AdminUser
) -> None:
    session = await get_session(db, session_id)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="course_session.deleted",
        entity_type="course_session",
        entity_id=session.id,
        before={"course_id": str(session.course_id)},
    )
    # 연결된 이력은 session_id 만 끊긴다(FK SET NULL) — 이력 자체는 보존
    await session_repo.delete(db, session)


async def create_records_for_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    trainee_ids: list[uuid.UUID],
    completed_hours: Decimal | None,
    completion_status: str,
    memo: str | None,
    actor: AdminUser,
) -> tuple[list[TrainingRecord], int]:
    """일정에 교육생 일괄 연결 — 연결 즉시 교육이력 생성. 중복 연결은 건너뛴다."""
    if not trainee_ids:
        raise api_error("VALIDATION_ERROR", message="연결할 교육생을 선택해 주세요")
    if completion_status not in {"in_progress", "completed", "canceled"}:
        raise api_error("VALIDATION_ERROR", message="올바르지 않은 수료 상태예요")

    session = await get_session(db, session_id)
    course = session.course

    # 이미 이 일정에 연결된 교육생 — 재연결 방지
    existing = set(
        (
            await db.execute(
                select(TrainingRecord.trainee_id).where(
                    TrainingRecord.session_id == session.id,
                    TrainingRecord.deleted_at.is_(None),
                )
            )
        ).scalars()
    )

    # 수료 상태 자동 판정 — 교육 기간이 아직 안 끝났으면 진행중으로 생성
    # (명시적으로 다른 상태를 요청하면 그 값을 존중)
    today = today_kst()
    effective_end = session.ended_at or session.started_at
    finished = effective_end is not None and effective_end < today
    if completion_status == "completed" and not finished:
        completion_status = "in_progress"

    hours = completed_hours if completed_hours is not None else session.recognized_hours
    if completion_status == "in_progress":
        hours = Decimal(0)  # 미수료 — 이수 시수는 수료 처리할 때 입력
    records: list[TrainingRecord] = []
    skipped = 0
    for trainee_id in dict.fromkeys(trainee_ids):  # 요청 내 중복 제거
        if trainee_id in existing:
            skipped += 1
            continue
        trainee = await db.get(Trainee, trainee_id)
        if trainee is None:
            raise api_error("NOT_FOUND", message="교육생을 찾을 수 없어요")
        records.append(
            TrainingRecord(
                training_record_no=_record_no(),
                trainee_id=trainee_id,
                course_id=course.id,
                session_id=session.id,
                institution_id=course.institution_id,
                course_name=course.name,
                institution_name=(
                    course.institution.name if course.institution else ""
                ),
                # 확인서 표기용 — 교육생 마스터 스냅샷
                supervisor_grade=trainee.supervisor_grade,
                supervisor_cert_no=trainee.cert_no,
                total_hours=session.recognized_hours,
                completed_hours=hours,
                started_at=session.started_at,
                ended_at=session.ended_at,
                source="internal",
                completion_status=completion_status,
                completed_at=now_kst() if completion_status == "completed" else None,
                memo=memo,
                created_by=actor.id,
                updated_by=actor.id,
            )
        )
    if records:
        db.add_all(records)
        await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="training_record.bulk_created",
        entity_type="course_session",
        entity_id=session.id,
        after={
            "created": len(records),
            "skipped": skipped,
            "trainee_ids": [str(t) for t in trainee_ids],
        },
    )
    await db.commit()
    return records, skipped
