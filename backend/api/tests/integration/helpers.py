"""통합 테스트 데이터 팩토리 + 인증 헬퍼."""

import uuid
from decimal import Decimal

from app.core.config import settings
from app.core.crypto import encrypt_field, name_columns, sha256_hex
from app.core.kst import now_kst
from app.core.security import hash_password
from app.core.session import create_admin_session, create_user_session
from app.domain.auth.model import AdminUser
from app.domain.trainee.model import MembershipGrade, Trainee
from app.domain.training_record.model import TrainingRecord
from app.domain.user.model import User


def member_cookie(token: str) -> dict[str, str]:
    return {settings.SESSION_COOKIE_NAME: token}


def admin_cookie(token: str) -> dict[str, str]:
    """관리자 세션 쿠키 — require_admin 이 ADMIN_SESSION_COOKIE_NAME 을 읽는다."""
    return {settings.ADMIN_SESSION_COOKIE_NAME: token}


async def make_admin(
    db, email="admin@example.com", role="super"
) -> tuple[AdminUser, str]:
    admin = AdminUser(
        email=email,
        password_hash=hash_password("admin-passw0rd"),
        name="테스트 관리자",
        role=role,
    )
    db.add(admin)
    await db.flush()
    return admin, await create_admin_session(db, admin.id, "test-agent")


async def make_grade(
    db, code="regular", name="정회원", sort_order=1
) -> MembershipGrade:
    grade = MembershipGrade(code=code, name=name, sort_order=sort_order)
    db.add(grade)
    await db.flush()
    return grade


async def make_trainee(
    db,
    grade_id: uuid.UUID,
    *,
    ci_raw: str | None = "ci-person",
    name: str = "홍길동",
    trainee_no: str = "TR-2026-0001",
    review_status: str = "approved",
) -> tuple[User, Trainee]:
    user_name_encrypted, user_name_hash = name_columns(name)
    user = (
        User(
            ci_hash=sha256_hex(ci_raw),
            name_encrypted=user_name_encrypted,
            name_hash=user_name_hash,
        )
        if ci_raw
        else None
    )
    if user:
        db.add(user)
        await db.flush()
    name_encrypted, name_hash_value = name_columns(name)
    trainee = Trainee(
        user_id=user.id if user else None,
        trainee_no=trainee_no,
        name_encrypted=name_encrypted,
        name_hash=name_hash_value,
        phone_encrypted=encrypt_field("01012345678"),
        membership_grade_id=grade_id,
        review_status=review_status,
    )
    db.add(trainee)
    await db.flush()
    return user, trainee


async def make_record(
    db,
    trainee_id: uuid.UUID,
    *,
    completion_status: str = "completed",
    record_no: str = "TRN-2026-0001",
) -> TrainingRecord:
    record = TrainingRecord(
        training_record_no=record_no,
        trainee_id=trainee_id,
        course_name="안전보건교육",
        institution_name="카이사안전교육원",
        total_hours=Decimal("16.00"),
        completed_hours=Decimal("16.00"),
        completion_status=completion_status,
        completed_at=now_kst() if completion_status == "completed" else None,
    )
    db.add(record)
    await db.flush()
    return record


async def make_pricing(
    db,
    grade_id: uuid.UUID,
    *,
    price_krw: int = 0,
) -> MembershipGrade:
    """등급 발급 단가 설정 — 가격은 등급이 직접 가진다 (구 가격 규칙 폐지)."""
    grade = await db.get(MembershipGrade, grade_id)
    grade.price_krw = price_krw
    await db.flush()
    return grade


async def member_token(db, user: User) -> str:
    return await create_user_session(db, user.id, "pass")


def portone_payment(
    order_no: str,
    *,
    total: int,
    store_id: str | None = None,
    status: str = "PAID",
) -> dict:
    return {
        "id": order_no,
        "status": status,
        "amount": {"total": total, "currency": "KRW"},
        "storeId": store_id or settings.PORTONE_STORE_ID,
    }
