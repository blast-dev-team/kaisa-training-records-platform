import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.crypto import encrypt_field
from app.core.error_codes import api_error
from app.domain.auth.model import AdminUser
from app.domain.trainee.model import MembershipGrade, Trainee, TraineeGradeHistory
from app.domain.trainee.repository import trainee_repository as repo
from app.domain.trainee.schema import (
    MembershipGradeCreate,
    MembershipGradeUpdate,
    TraineeUpdate,
)


async def get_trainee(db: AsyncSession, trainee_id: uuid.UUID) -> Trainee:
    trainee = await repo.find_by_id(db, trainee_id)
    if trainee is None:
        raise api_error("NOT_FOUND")
    return trainee


async def list_trainees(
    db: AsyncSession,
    search: str | None = None,
    review_status: str | None = None,
    grade_id: uuid.UUID | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Trainee], int]:
    return await repo.list_trainees(
        db,
        search=search,
        review_status=review_status,
        grade_id=grade_id,
        page=page,
        limit=limit,
    )


async def update_trainee(
    db: AsyncSession, trainee_id: uuid.UUID, data: TraineeUpdate, actor: AdminUser
) -> Trainee:
    """등급 변경 시 trainee_grade_histories insert + audit. 전화는 암호화 저장."""
    trainee = await get_trainee(db, trainee_id)
    updates = data.model_dump(
        exclude_unset=True, exclude={"phone", "grade_change_reason"}
    )

    if "membership_grade_id" in updates:
        new_grade_id = updates.pop("membership_grade_id")
        if new_grade_id and new_grade_id != trainee.membership_grade_id:
            grade = await repo.find_grade_by_id(db, new_grade_id)
            if grade is None:
                raise api_error("NOT_FOUND", message="회원등급을 찾을 수 없어요")
            db.add(
                TraineeGradeHistory(
                    trainee_id=trainee.id,
                    previous_grade_id=trainee.membership_grade_id,
                    new_grade_id=new_grade_id,
                    change_reason=data.grade_change_reason,
                    changed_by=actor.id,
                )
            )
            record_audit(
                db,
                actor_admin_id=actor.id,
                action="trainee.grade_changed",
                entity_type="trainee",
                entity_id=trainee.id,
                before={
                    "grade_id": str(trainee.membership_grade_id)
                    if trainee.membership_grade_id
                    else None
                },
                after={
                    "grade_id": str(new_grade_id),
                    "reason": data.grade_change_reason,
                },
            )
            trainee.membership_grade_id = new_grade_id

    if "phone" in data.model_fields_set:
        phone = data.model_dump(exclude_unset=True).get("phone")
        trainee.phone_encrypted = encrypt_field(phone) if phone else None

    for field, value in updates.items():
        setattr(trainee, field, value)
    if updates or "phone" in data.model_fields_set:
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="trainee.updated",
            entity_type="trainee",
            entity_id=trainee.id,
            after={k: str(v) for k, v in updates.items()},
        )

    await db.commit()
    await db.refresh(trainee)
    return trainee


# ── 등급 마스터 ────────────────────────────────────────────────────────────────


async def list_grades(
    db: AsyncSession, is_active: bool | None = None
) -> list[MembershipGrade]:
    return await repo.list_grades(db, is_active=is_active)


async def create_grade(
    db: AsyncSession, data: MembershipGradeCreate, actor: AdminUser
) -> MembershipGrade:
    if await repo.find_grade_by_code(db, data.code):
        raise api_error(
            "VALIDATION_ERROR", status_code=409, message="이미 등록된 등급 코드예요"
        )
    grade = MembershipGrade(**data.model_dump())
    db.add(grade)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="membership_grade.created",
        entity_type="membership_grade",
        entity_id=grade.id,
        after={"code": grade.code, "name": grade.name},
    )
    await db.commit()
    await db.refresh(grade)
    return grade


async def update_grade(
    db: AsyncSession, grade_id: uuid.UUID, data: MembershipGradeUpdate, actor: AdminUser
) -> MembershipGrade:
    grade = await repo.find_grade_by_id(db, grade_id)
    if grade is None:
        raise api_error("NOT_FOUND")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(grade, field, value)
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="membership_grade.updated",
        entity_type="membership_grade",
        entity_id=grade.id,
        after={k: str(v) for k, v in data.model_dump(exclude_unset=True).items()},
    )
    await db.commit()
    await db.refresh(grade)
    return grade
