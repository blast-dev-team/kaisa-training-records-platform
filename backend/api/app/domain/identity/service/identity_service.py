import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import settings
from app.core.crypto import encrypt_field, sha256_hex
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.core.security import issue_state, read_state
from app.core.session import create_user_session
from app.domain.auth.model import AdminUser
from app.domain.identity.model import IdentityReview, IdentityVerification
from app.domain.identity.repository import identity_repository as repo
from app.domain.identity.schema import (
    PassCompleteResponse,
    PassStartResponse,
)
from app.domain.trainee.model import Trainee
from app.domain.user.model import User
from app.integrations import portone


async def start_pass() -> PassStartResponse:
    """PASS 인증 시작 — PortOne 세션 생성 후 서명된 state 발급.

    인증 row 는 complete 시점에 생성한다 (user_id NOT NULL — 계정은 ci 확정 후 생김).
    """
    if not settings.PORTONE_IDENTITY_CHANNEL_KEY or not settings.PORTONE_API_SECRET:
        raise api_error(
            "PORTONE_NOT_CONFIGURED",
            status_code=503,
            message="본인인증이 설정되지 않았어요",
        )
    result = await portone.create_identity_verification()
    verification_id = result.get("id")
    redirect_url = result.get("redirect_url") or result.get("pg_redirect_url")
    if not verification_id or not redirect_url:
        raise api_error(
            "PORTONE_INVALID_RESPONSE",
            status_code=502,
            message="본인인증 응답이 올바르지 않아요",
        )
    return PassStartResponse(
        identity_verification_id=str(verification_id),
        redirect_url=str(redirect_url),
        state=issue_state(str(verification_id)),
    )


async def complete_pass(
    db: AsyncSession, state: str
) -> tuple[PassCompleteResponse, str]:
    """state 검증 → single-fetch → ci/di 즉시 해시 후 폐기 → find-or-create + 세션 발급.

    반환은 (응답, 세션 토큰) — 쿠키 세팅은 router 가 담당.
    """
    verification_id = read_state(state)
    if verification_id is None:
        raise api_error(
            "IDENTITY_STATE_MISMATCH",
            message="인증 요청이 만료되었거나 올바르지 않아요. 다시 시도해 주세요",
        )
    replayed = (
        await db.execute(
            select(IdentityVerification.id).where(
                IdentityVerification.provider_verification_id == verification_id
            )
        )
    ).scalar_one_or_none()
    if replayed is not None:
        raise api_error(
            "IDENTITY_ALREADY_USED",
            status_code=400,
            message="이미 처리된 인증 요청이에요",
        )
    result = await portone.get_identity_verification(verification_id)
    if result.get("status") != "VERIFIED":
        raise api_error(
            "IDENTITY_NOT_VERIFIED",
            status_code=400,
            message="본인인증이 완료되지 않았어요",
        )
    customer = result.get("verified_customer") or result.get("customer") or {}
    ci = customer.get("ci") or customer.get("ci_hash")
    if not ci:
        raise api_error(
            "IDENTITY_NO_CI", status_code=502, message="본인인증 결과에 CI 가 없어요"
        )
    ci_hash = sha256_hex(str(ci))
    di_hash = sha256_hex(str(customer["di"])) if customer.get("di") else None
    name = customer.get("name")
    phone = customer.get("phone") or customer.get("phone_number")

    user = await repo.find_user_by_ci_hash(db, ci_hash)
    matched = True
    if user is None:
        matched = False
        user = User(ci_hash=ci_hash, name=name)
        db.add(user)
        await db.flush()  # user.id 채운 뒤 인증 row 생성 (user_id NOT NULL)
    user.last_login_at = now_kst()
    user.name = user.name or name

    verification = IdentityVerification(
        user_id=user.id,
        provider_verification_id=verification_id,
        status="verified",
        verified_name=name,
        verified_phone_encrypted=encrypt_field(str(phone)) if phone else None,
        ci_hash=ci_hash,
        di_hash=di_hash,
        verified_at=now_kst(),
    )
    db.add(verification)
    await db.flush()

    # 매칭·등급 판별은 비동기 점검 — 로그인 제한 없음
    trainee = await repo.find_trainee_by_user_id(db, user.id)
    if trainee is not None:
        if trainee.review_status != "approved":
            trainee.review_status = "approved"
            trainee.reviewed_at = now_kst()
        db.add(
            IdentityReview(
                identity_verification_id=verification.id,
                user_id=user.id,
                trainee_id=trainee.id,
                status="approved",
                matched_by="ci",
                determined_grade_id=trainee.membership_grade_id,
                reviewed_at=now_kst(),
            )
        )
        review_status = "approved"
    else:
        db.add(
            IdentityReview(
                identity_verification_id=verification.id,
                user_id=user.id,
                status="manual_review",
            )
        )
        review_status = "manual_review"

    token = await create_user_session(db, user.id, "pass")
    await db.commit()

    return (
        PassCompleteResponse(
            id=user.id,
            name=user.name,
            matched=matched,
            review_status=review_status,
        ),
        token,
    )


# ── 어드민 심사 ────────────────────────────────────────────────────────────────


async def list_reviews(
    db: AsyncSession,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[IdentityReview], int]:
    return await repo.list_reviews(db, status=status, page=page, limit=limit)


async def approve_review(
    db: AsyncSession,
    review_id: uuid.UUID,
    trainee_id: uuid.UUID,
    determined_grade_id: uuid.UUID | None,
    actor: AdminUser,
) -> IdentityReview:
    """수동 매칭 — trainee.user_id 연결 + 등급 확정 + 심사 완료."""
    review = await repo.find_review_by_id(db, review_id)
    if review is None:
        raise api_error("NOT_FOUND", message="심사 건을 찾을 수 없어요")
    if review.status != "manual_review":
        raise api_error(
            "INVALID_STATUS_TRANSITION", message="심사 대기 상태가 아니에요"
        )

    trainee = (
        await db.execute(select(Trainee).where(Trainee.id == trainee_id))
    ).scalar_one_or_none()
    if trainee is None:
        raise api_error("NOT_FOUND", message="회원을 찾을 수 없어요")
    if trainee.user_id is not None and trainee.user_id != review.user_id:
        raise api_error(
            "TRAINEE_ALREADY_LINKED",
            status_code=409,
            message="이미 다른 계정에 연결된 교육생이에요",
        )

    trainee.user_id = review.user_id
    trainee.review_status = "approved"
    trainee.reviewed_at = now_kst()
    if determined_grade_id:
        trainee.membership_grade_id = determined_grade_id
    review.status = "approved"
    review.matched_by = "manual"
    review.trainee_id = trainee.id
    review.determined_grade_id = determined_grade_id or trainee.membership_grade_id
    review.reviewed_by = actor.id
    review.reviewed_at = now_kst()

    record_audit(
        db,
        actor_admin_id=actor.id,
        action="identity_review.approved",
        entity_type="identity_review",
        entity_id=review.id,
        after={
            "trainee_id": str(trainee.id),
            "grade_id": str(review.determined_grade_id),
        },
    )
    await db.commit()
    await db.refresh(review)
    return review


async def reject_review(
    db: AsyncSession,
    review_id: uuid.UUID,
    review_note: str,
    actor: AdminUser,
) -> IdentityReview:
    review = await repo.find_review_by_id(db, review_id)
    if review is None:
        raise api_error("NOT_FOUND", message="심사 건을 찾을 수 없어요")
    if review.status != "manual_review":
        raise api_error(
            "INVALID_STATUS_TRANSITION", message="심사 대기 상태가 아니에요"
        )

    review.status = "rejected"
    review.review_note = review_note
    review.reviewed_by = actor.id
    review.reviewed_at = now_kst()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="identity_review.rejected",
        entity_type="identity_review",
        entity_id=review.id,
        after={"note": review_note},
    )
    await db.commit()
    await db.refresh(review)
    return review
