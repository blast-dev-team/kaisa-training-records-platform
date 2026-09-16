import secrets
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
from app.domain.certificate.model import CertificatePricingRule
from app.domain.identity.model import IdentityReview, IdentityVerification
from app.domain.identity.repository import identity_repository as repo
from app.domain.identity.schema import (
    PassCompleteResponse,
    PassStartRequest,
    PassStartResponse,
    PassTestLoginRequest,
)
from app.domain.trainee.model import MembershipGrade, Trainee
from app.domain.user.model import User
from app.integrations import portone


async def _ensure_demo_grade(db: AsyncSession) -> MembershipGrade:
    """데모 교육생용 등급 — 시드된 첫 등급, 없으면 정회원을 만든다."""
    grade = (
        await db.execute(
            select(MembershipGrade).order_by(MembershipGrade.sort_order).limit(1)
        )
    ).scalars().first()
    if grade is None:
        grade = MembershipGrade(code="regular", name="정회원", sort_order=1)
        db.add(grade)
        await db.flush()
    return grade


async def _ensure_demo_pricing(db: AsyncSession, grade_id: uuid.UUID) -> None:
    """데모 가격 규칙 보장 — original·reissue 3,000원 (FE 발급 수수료 표기와 동일).

    데모 환경에서 등급만 있고 규칙이 없으면 발급 신청이 PRICING_RULE_NOT_FOUND 로
    막힌다. 규칙이 이미 있으면 건드리지 않는다 (어드민이 정한 가격 우선).
    """
    for issue_type in ("original", "reissue"):
        exists = (
            await db.execute(
                select(CertificatePricingRule.id).where(
                    CertificatePricingRule.membership_grade_id == grade_id,
                    CertificatePricingRule.issue_type == issue_type,
                    CertificatePricingRule.is_active.is_(True),
                )
            )
        ).first()
        if exists is None:
            db.add(
                CertificatePricingRule(
                    membership_grade_id=grade_id,
                    issue_type=issue_type,
                    price_krw=3000,
                    currency="KRW",
                    valid_from=now_kst().replace(year=2020),
                    is_active=True,
                )
            )


async def _create_demo_trainee(
    db: AsyncSession, user: User, name: str | None, phone: str | None
) -> Trainee:
    """본인인증 완료 계정에 데모 교육생 자동 생성 — 등급은 데모 등급을 단다."""
    grade = await _ensure_demo_grade(db)
    trainee = Trainee(
        user_id=user.id,
        trainee_no=f"TR-{now_kst().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}",
        name=user.name or name or "교육생",
        phone_encrypted=encrypt_field(str(phone)) if phone else None,
        membership_grade_id=grade.id,
        review_status="approved",
        reviewed_at=now_kst(),
    )
    db.add(trainee)
    await db.flush()
    return trainee


async def start_pass(body: PassStartRequest) -> PassStartResponse:
    """PASS 인증 시작 — FE가 만든 본인인증 건 ID에 서명된 state 를 발급.

    인증창은 브라우저 SDK가 열고, 서버는 complete 시점에 포트원에서 결과를
    직접 조회한다. 서버에서 PortOne 세션을 만드는 리디렉션 방식
    (portone.create_identity_verification)은 모바일 등 SDK 불가 환경 대비만 남긴다.
    인증 row 는 complete 시점에 생성한다 (user_id NOT NULL — 계정은 ci 확정 후 생김).
    """
    if not settings.PORTONE_IDENTITY_CHANNEL_KEY or not settings.PORTONE_API_SECRET:
        raise api_error(
            "PORTONE_NOT_CONFIGURED",
            status_code=503,
            message="본인인증이 설정되지 않았어요",
        )
    verification_id = body.identity_verification_id.strip()
    if not verification_id:
        raise api_error("VALIDATION_ERROR", message="본인인증 요청이 올바르지 않아요")
    return PassStartResponse(
        identity_verification_id=verification_id,
        state=issue_state(verification_id),
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
    # PortOne V2 응답은 camelCase (공식 SDK _generated 직렬화 기준) — ci/di 는 PG 제공 시에만 포함
    customer = result.get("verifiedCustomer") or {}
    phone = customer.get("phoneNumber")
    ci = customer.get("ci")
    if not ci and settings.ENVIRONMENT != "production":
        # 테스트 채널 수기 인증은 CI 를 안 준다 — 전화번호로 대체 식별.
        # (PortOne verifiedCustomer.id 는 인증 건마다 새로 생성돼 불안정 — 동일인 비교로 확인)
        # `test:` prefix 로 실 CI 와 해시 충돌 방지. production 은 CI 필수.
        ci = f"test:{phone}" if phone else None
    if not ci:
        raise api_error(
            "IDENTITY_NO_CI", status_code=502, message="본인인증 결과에 CI 가 없어요"
        )
    ci_hash = sha256_hex(str(ci))
    di_hash = sha256_hex(str(customer["di"])) if customer.get("di") else None
    name = customer.get("name")
    # PortOne birthDate 는 '1996-07-27' (10자) — users.birth 는 YYYYMMDD 8자
    birthday = (customer.get("birthDate") or "").replace("-", "") or None

    user = await repo.find_user_by_ci_hash(db, ci_hash)
    matched = True
    if user is None:
        matched = False
        user = User(ci_hash=ci_hash, name=name)
        db.add(user)
        await db.flush()  # user.id 채운 뒤 인증 row 생성 (user_id NOT NULL)
    user.last_login_at = now_kst()
    user.name = user.name or name
    # 생년월일은 본인인증으로 확정된 값 — 비어 있을 때만 채운다
    if birthday and not user.birth:
        user.birth = str(birthday)

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
    if trainee is None and settings.ENVIRONMENT != "production":
        # local·staging(dev) — 데모: 교육생 미연결 회원은 자동 생성해 발급·결제
        # 플로우를 바로 체험할 수 있게 한다. production 은 수동 심사로 간다.
        trainee = await _create_demo_trainee(db, user, name, phone)
    if (
        trainee is not None
        and settings.ENVIRONMENT != "production"
        and trainee.membership_grade_id is not None
    ):
        # 데모 — 발급 신청이 가격 규칙 부재로 막히지 않게 보장 (production 은 어드민 등록)
        await _ensure_demo_pricing(db, trainee.membership_grade_id)
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


async def test_login(
    db: AsyncSession, body: PassTestLoginRequest
) -> tuple[PassCompleteResponse, str]:
    """성명 '테스트' 입력 시 PASS 인증 없이 로그인 — local·staging 데모 전용.

    고정 CI 로 find-or-create 하고 데모 교육생을 연결해 발급 플로우까지
    바로 체험할 수 있게 한다. production 은 404 로 엔드포인트를 숨긴다.
    """
    if settings.ENVIRONMENT == "production":
        raise api_error("NOT_FOUND", status_code=404, message="리소스를 찾을 수 없어요")
    name = body.name.strip() or "테스트"
    ci_hash = sha256_hex("test:demo")
    user = await repo.find_user_by_ci_hash(db, ci_hash)
    matched = True
    if user is None:
        matched = False
        user = User(ci_hash=ci_hash, name=name)
        db.add(user)
        await db.flush()
    user.last_login_at = now_kst()
    user.name = user.name or name

    verification = IdentityVerification(
        user_id=user.id,
        provider_verification_id=f"test-{uuid.uuid4()}",
        status="verified",
        verified_name=name,
        ci_hash=ci_hash,
        verified_at=now_kst(),
    )
    db.add(verification)
    await db.flush()

    trainee = await repo.find_trainee_by_user_id(db, user.id)
    if trainee is None:
        trainee = await _create_demo_trainee(db, user, name, None)
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

    token = await create_user_session(db, user.id, "pass")
    await db.commit()

    return (
        PassCompleteResponse(
            id=user.id,
            name=user.name,
            matched=matched,
            review_status="approved",
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
