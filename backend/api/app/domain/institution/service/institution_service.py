import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.institution.model import TrainingCourse, TrainingInstitution
from app.domain.institution.model.course_session import CourseSession
from app.domain.institution.model.session_name import SessionName
from app.domain.institution.repository import institution_repository as repo
from app.domain.institution.schema import (
    CourseCreate,
    CourseUpdate,
    InstitutionCreate,
    InstitutionUpdate,
)
from app.domain.training_record.model import TrainingRecord
from app.domain.training_record.service.external_hours import record_source_for


async def get_institution(
    db: AsyncSession, institution_id: uuid.UUID
) -> TrainingInstitution:
    institution = await repo.find_institution_by_id(db, institution_id)
    if institution is None:
        raise api_error("NOT_FOUND", message="교육기관을 찾을 수 없어요")
    return institution


async def list_institutions(
    db: AsyncSession,
    is_active: bool | None = None,
    institution_type: str | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[TrainingInstitution], int]:
    return await repo.list_institutions(
        db,
        is_active=is_active,
        institution_type=institution_type,
        search=search,
        page=page,
        limit=limit,
    )


async def create_institution(
    db: AsyncSession, data: InstitutionCreate, actor: AdminUser
) -> TrainingInstitution:
    if data.institution_code and await repo.find_institution_by_code(
        db, data.institution_code
    ):
        raise api_error(
            "VALIDATION_ERROR", status_code=409, message="이미 등록된 기관 코드예요"
        )
    institution = TrainingInstitution(**data.model_dump())
    db.add(institution)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="institution.created",
        entity_type="training_institution",
        entity_id=institution.id,
        after={
            "name": institution.name,
            "institution_type": institution.institution_type,
        },
    )
    await db.commit()
    await db.refresh(institution)
    return institution


async def update_institution(
    db: AsyncSession,
    institution_id: uuid.UUID,
    data: InstitutionUpdate,
    actor: AdminUser,
) -> TrainingInstitution:
    institution = await get_institution(db, institution_id)
    # 바뀐 필드만 before/after 에 남긴다 — 내부·외부 지정(institution_type) 포함
    updates = data.model_dump(exclude_unset=True)
    new_code = updates.get("institution_code")
    if new_code and new_code != institution.institution_code:
        dup = await repo.find_institution_by_code(db, new_code)
        if dup is not None and dup.id != institution.id:
            raise api_error(
                "VALIDATION_ERROR", status_code=409, message="이미 등록된 기관 코드예요"
            )
    before = {k: getattr(institution, k) for k in updates}
    old_type = institution.institution_type
    for field, value in updates.items():
        setattr(institution, field, value)
    # 기관 유형 변경 → 그 기관의 교육내역 소스·과정 플래그를 같이 맞춘다.
    # 소스는 생성 시점 파생이라 타입이 바뀌면 기존 내역이 뒤처진다.
    synced_records = 0
    new_type = institution.institution_type
    if old_type != new_type:
        # 지정된 사내 기관만 internal, 그 외(외부·미지정)는 external — '이관' 표시는 쓰지 않는다
        derived_source = record_source_for(new_type)
        result = await db.execute(
            update(TrainingRecord)
            .where(
                TrainingRecord.institution_id == institution.id,
                TrainingRecord.deleted_at.is_(None),
                TrainingRecord.source != derived_source,
            )
            .values(source=derived_source, updated_at=now_kst())
        )
        synced_records = result.rowcount
        # 일정의 외부 표시(source)도 기관 구분을 따라간다 — 연결 다이얼로그 체크 기본값이 이걸 읽는다
        course_ids = select(TrainingCourse.id).where(
            TrainingCourse.institution_id == institution.id
        )
        await db.execute(
            update(CourseSession)
            .where(
                CourseSession.course_id.in_(course_ids),
                CourseSession.source != derived_source,
            )
            .values(source=derived_source)
        )
        await db.execute(
            update(TrainingCourse)
            .where(
                TrainingCourse.institution_id == institution.id,
                TrainingCourse.is_external != (derived_source == "external"),
            )
            .values(is_external=derived_source == "external")
        )
    synced_names = 0
    if "name" in updates and institution.name != before.get("name"):
        synced_names = await repo.sync_record_institution_name(
            db, institution.id, institution.name
        )
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="institution.updated",
        entity_type="training_institution",
        entity_id=institution.id,
        before=before,
        after={
            **{k: getattr(institution, k) for k in updates},
            "synced_records": synced_records,
            "synced_record_names": synced_names,
        },
    )
    await db.commit()
    await db.refresh(institution)
    return institution


async def delete_institution(
    db: AsyncSession, institution_id: uuid.UUID, actor: AdminUser
) -> None:
    """소프트딜리트 — is_active false. 활성 과정이 남아 있으면 409 차단."""
    institution = await get_institution(db, institution_id)
    active_course = (
        await db.execute(
            select(TrainingCourse.id)
            .where(
                TrainingCourse.institution_id == institution.id,
                TrainingCourse.is_active.is_(True),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if active_course is not None:
        raise api_error(
            "INSTITUTION_HAS_ACTIVE_COURSES",
            status_code=409,
            message="이 기관에 활성 과정이 남아 있어요. 과정을 먼저 정리해 주세요",
        )
    institution.is_active = False
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="institution.deleted",
        entity_type="training_institution",
        entity_id=institution.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    await db.commit()


# ── 과정 (기관 하위 마스터) ─────────────────────────────────────────────────────


async def get_course(db: AsyncSession, course_id: uuid.UUID) -> TrainingCourse:
    course = await repo.find_course_by_id(db, course_id)
    if course is None:
        raise api_error("NOT_FOUND", message="교육과정을 찾을 수 없어요")
    return course


async def list_courses(
    db: AsyncSession,
    institution_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    category: str | None = None,
    is_external: bool | None = None,
    sort: str | None = None,
    order: str = "desc",
    page: int = 1,
    limit: int = 20,
) -> tuple[list[TrainingCourse], int]:
    return await repo.list_courses(
        db,
        institution_id=institution_id,
        is_active=is_active,
        search=search,
        category=category,
        is_external=is_external,
        sort=sort,
        order=order,
        page=page,
        limit=limit,
    )


async def list_categories(db: AsyncSession, search: str | None = None) -> list[str]:
    return await repo.list_categories(db, search=search)


async def _ensure_session_name(
    db: AsyncSession, session_name_id: uuid.UUID | None
) -> None:
    """회차명 참조 확인 — 없는 id 는 FK 위반(500) 대신 404."""
    if (
        session_name_id is not None
        and await db.get(SessionName, session_name_id) is None
    ):
        raise api_error("NOT_FOUND", message="회차명을 찾을 수 없어요")


async def create_course(
    db: AsyncSession, data: CourseCreate, actor: AdminUser
) -> TrainingCourse:
    institution = await repo.find_institution_by_id(db, data.institution_id)
    if institution is None:
        raise api_error("NOT_FOUND", message="교육기관을 찾을 수 없어요")
    if data.course_code and await repo.find_course_by_code(db, data.course_code):
        raise api_error(
            "VALIDATION_ERROR", status_code=409, message="이미 등록된 과정 코드예요"
        )
    await _ensure_session_name(db, data.session_name_id)
    dump = data.model_dump()
    # 사내/외부 플래그는 소속 기관 구분을 따른다 — 요청 값은 무시한다 (기관↔플래그 어긋남 방지)
    dump["is_external"] = record_source_for(institution.institution_type) == "external"
    course = TrainingCourse(**dump)
    db.add(course)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="course.created",
        entity_type="training_course",
        entity_id=course.id,
        after={"name": course.name, "institution_id": str(course.institution_id)},
    )
    await db.commit()
    await db.refresh(course)
    return course


async def _move_course_institution(
    db: AsyncSession, course: TrainingCourse, new_institution: TrainingInstitution
) -> dict:
    """과정의 기관 변경 — 과정·일정·교육이력을 새 기관 기준으로 함께 맞춘다.

    - 일정(course_sessions.source): 새 기관 구분을 따른다(연결 다이얼로그 기본값).
    - 교육이력(삭제되지 않은 것): institution_id·institution_name 스냅샷·source 를 새 기관으로.
    - 발급이 끝난 확인서·수료증은 자체 스냅샷을 가지므로 바뀌지 않는다.
    - 외부교육 16시간 한도는 막지 않는다 — 잘못 연결된 기관을 바로잡는 정정이라, 이미 등록된
      이력을 거절할 수 없다. 확인서 합계는 외부 16시간으로 고정되므로 발급 합계는 넘지 않는다.
    """
    old_institution_id = course.institution_id
    old_name = course.institution.name if course.institution else ""
    new_source = record_source_for(new_institution.institution_type)
    course.institution_id = new_institution.id
    course.institution = new_institution
    session_result = await db.execute(
        update(CourseSession)
        .where(CourseSession.course_id == course.id, CourseSession.source != new_source)
        .values(source=new_source)
        .execution_options(synchronize_session=False)
    )
    record_result = await db.execute(
        update(TrainingRecord)
        .where(
            TrainingRecord.course_id == course.id,
            TrainingRecord.deleted_at.is_(None),
        )
        .values(
            institution_id=new_institution.id,
            institution_name=new_institution.name,
            source=new_source,
            updated_at=now_kst(),
        )
        .execution_options(synchronize_session=False)
    )
    return {
        "before": {"institution_id": str(old_institution_id), "institution_name": old_name},
        "after": {
            "institution_id": str(new_institution.id),
            "institution_name": new_institution.name,
            "synced_sessions": session_result.rowcount or 0,
            "synced_institution_records": record_result.rowcount or 0,
        },
    }


async def count_course_links(db: AsyncSession, course_id: uuid.UUID) -> dict[str, int]:
    """과정에 연결된 일정·교육이력 수 — 기관 변경 전 안내용."""
    await get_course(db, course_id)
    sessions = await db.scalar(
        select(func.count()).select_from(CourseSession).where(CourseSession.course_id == course_id)
    )
    records = await db.scalar(
        select(func.count())
        .select_from(TrainingRecord)
        .where(TrainingRecord.course_id == course_id, TrainingRecord.deleted_at.is_(None))
    )
    return {"session_count": int(sessions or 0), "record_count": int(records or 0)}


async def update_course(
    db: AsyncSession, course_id: uuid.UUID, data: CourseUpdate, actor: AdminUser
) -> TrainingCourse:
    course = await get_course(db, course_id)
    before = {"name": course.name, "is_active": course.is_active}
    updates = data.model_dump(exclude_unset=True)
    # 기관 변경 — 처음 연결한 기관이 잘못됐을 때 바로잡을 수 있게 허용한다.
    # 과정에 딸린 일정·교육이력도 새 기관을 따라가도록 아래에서 같이 맞춘다.
    requested_institution = updates.pop("institution_id", None)
    new_institution = None
    if (
        requested_institution is not None
        and requested_institution != course.institution_id
    ):
        new_institution = await repo.find_institution_by_id(db, requested_institution)
        if new_institution is None:
            raise api_error("NOT_FOUND", message="변경할 교육기관을 찾을 수 없어요")
        if not new_institution.is_active:
            raise api_error(
                "VALIDATION_ERROR", message="사용하지 않는 교육기관으로는 옮길 수 없어요"
            )
    new_code = updates.get("course_code")
    if new_code and new_code != course.course_code:
        dup = await repo.find_course_by_code(db, new_code)
        if dup is not None and dup.id != course.id:
            raise api_error(
                "VALIDATION_ERROR", status_code=409, message="이미 등록된 과정 코드예요"
            )
    if "session_name_id" in updates:
        await _ensure_session_name(db, updates["session_name_id"])
    for field, value in updates.items():
        setattr(course, field, value)
    moved: dict | None = None
    if new_institution is not None:
        moved = await _move_course_institution(db, course, new_institution)
    # 사내/외부 플래그는 소속 기관 구분을 따른다 — 요청의 is_external 은 무시한다
    if course.institution is not None:
        course.is_external = record_source_for(course.institution.institution_type) == "external"
    after: dict = {"name": course.name, "is_active": course.is_active}
    if moved is not None:
        before.update(moved["before"])
        after.update(moved["after"])
    # 과정명 변경 → 이 과정에 연결된 교육내역의 과정명 스냅샷도 맞춘다.
    # (발급 끝난 확인서·수료증은 자체 스냅샷을 가지므로 영향 없음)
    if course.name and course.name != before["name"]:
        synced = await repo.sync_record_course_name(db, course.id, course.name)
        after["synced_records"] = synced
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="course.updated",
        entity_type="training_course",
        entity_id=course.id,
        before=before,
        after=after,
    )
    await db.commit()
    await db.refresh(course)
    return course


async def delete_course(
    db: AsyncSession, course_id: uuid.UUID, actor: AdminUser
) -> None:
    """소프트딜리트 — is_active false. 교육이력은 과정명 스냅샷을 보므로 표시 무영향."""
    course = await get_course(db, course_id)
    course.is_active = False
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="course.deleted",
        entity_type="training_course",
        entity_id=course.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    await db.commit()
