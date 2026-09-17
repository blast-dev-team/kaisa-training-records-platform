import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.crypto import encrypt_field
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.certificate.model import CertificateRequest
from app.domain.payment.model import PaymentOrder
from app.domain.trainee.model import MembershipGrade, Trainee, TraineeGradeHistory
from app.domain.trainee.repository import trainee_repository as repo
from app.domain.trainee.schema import (
    MembershipGradeCreate,
    MembershipGradeUpdate,
    TraineeCreate,
    TraineeUpdate,
)

# 삭제 차단 — 아직 끝나지 않은 신청·결제가 있는 교육생은 지울 수 없다
_BLOCKING_REQUEST_STATUSES = ("pending", "payment_pending", "paid", "issuing")
_BLOCKING_ORDER_STATUSES = ("ready", "pending")


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


async def create_trainee(
    db: AsyncSession, data: TraineeCreate, actor: AdminUser
) -> Trainee:
    """어드민 수기 등록 — 신원 확인 완료 가정으로 approved. 등급 지정 시 초기 등급으로 배정."""
    if data.membership_grade_id is not None:
        grade = await repo.find_grade_by_id(db, data.membership_grade_id)
        if grade is None:
            raise api_error("NOT_FOUND", message="회원등급을 찾을 수 없어요")

    trainee = Trainee(
        trainee_no=f"TR-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}",
        name=data.name.strip(),
        birth_date=data.birth_date,
        phone_encrypted=encrypt_field(data.phone) if data.phone else None,
        email=data.email,
        memo=data.memo,
        membership_grade_id=data.membership_grade_id,
        review_status="approved",
        reviewed_at=now_kst(),
    )
    db.add(trainee)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="trainee.created",
        entity_type="trainee",
        entity_id=trainee.id,
        after={
            "trainee_no": trainee.trainee_no,
            "name": trainee.name,
            "grade_id": str(data.membership_grade_id)
            if data.membership_grade_id
            else None,
        },
    )
    await db.commit()
    await db.refresh(trainee)
    return trainee


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


async def delete_trainee(
    db: AsyncSession, trainee_id: uuid.UUID, actor: AdminUser
) -> None:
    """소프트딜리트 — deleted_at marking. 확인서·결제 이력은 FK 보존을 위해 그대로 둔다.

    진행 중인 발급 신청·미결제 결제가 있으면 409 차단.
    """
    trainee = await get_trainee(db, trainee_id)

    pending_request = (
        await db.execute(
            select(CertificateRequest.id)
            .where(
                CertificateRequest.trainee_id == trainee.id,
                CertificateRequest.status.in_(_BLOCKING_REQUEST_STATUSES),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if pending_request is not None:
        raise api_error(
            "TRAINEE_HAS_PENDING_WORK",
            status_code=409,
            message="진행 중인 발급 신청이 있어요. 처리 완료 후 삭제할 수 있어요",
        )

    unpaid_order = (
        await db.execute(
            select(PaymentOrder.id)
            .where(
                PaymentOrder.trainee_id == trainee.id,
                PaymentOrder.status.in_(_BLOCKING_ORDER_STATUSES),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if unpaid_order is not None:
        raise api_error(
            "TRAINEE_HAS_PENDING_WORK",
            status_code=409,
            message="미결제 주문이 있어요. 처리 완료 후 삭제할 수 있어요",
        )

    trainee.deleted_at = now_kst()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="trainee.deleted",
        entity_type="trainee",
        entity_id=trainee.id,
        before={"deleted_at": None},
        after={"deleted_at": trainee.deleted_at.isoformat()},
    )
    await db.commit()


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


async def delete_grade(
    db: AsyncSession, grade_id: uuid.UUID, actor: AdminUser
) -> None:
    """소프트딜리트 — is_active false. 배정된 활성 교육생이 있으면 409 차단.

    과거 발급 신청 이력은 등급 id 스냅샷을 물고 있어 row 는 항상 남는다.
    """
    grade = await repo.find_grade_by_id(db, grade_id)
    if grade is None:
        raise api_error("NOT_FOUND")
    assigned = (
        await db.execute(
            select(Trainee.id)
            .where(
                Trainee.membership_grade_id == grade.id,
                Trainee.deleted_at.is_(None),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if assigned is not None:
        raise api_error(
            "GRADE_HAS_ACTIVE_TRAINEES",
            status_code=409,
            message="이 등급이 배정된 교육생이 있어요. 등급을 먼저 변경해 주세요",
        )
    grade.is_active = False
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="membership_grade.deleted",
        entity_type="membership_grade",
        entity_id=grade.id,
        before={"is_active": True},
        after={"is_active": False},
    )
    await db.commit()
