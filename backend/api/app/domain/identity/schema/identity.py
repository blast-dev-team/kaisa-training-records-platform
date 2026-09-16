import uuid
from datetime import datetime

from pydantic import BaseModel

from app.core.crypto import decrypt_field, mask_phone


class PassStartRequest(BaseModel):
    """PASS 인증 시작 — FE가 만든 본인인증 건 ID로 브라우저 SDK 인증창을 연다."""

    identity_verification_id: str


class PassStartResponse(BaseModel):
    """PASS 인증 시작 — FE는 이 ID로 SDK 인증창을 열고, 복귀 시 state 로 complete 호출."""

    identity_verification_id: str
    # 리디렉션 방식(서버 생성 세션) 전용 — 브라우저 SDK 흐름에서는 미사용
    redirect_url: str | None = None
    state: str


class PassCompleteRequest(BaseModel):
    state: str


class PassTestLoginRequest(BaseModel):
    """테스트 본인인증 우회 로그인 — local·staging 전용 (identity_service.test_login)."""

    name: str = "테스트"


class PassCompleteResponse(BaseModel):
    account_type: str = "user"
    id: uuid.UUID
    name: str | None
    matched: bool
    review_status: str | None


class IdentityReviewResponse(BaseModel):
    id: uuid.UUID
    identity_verification_id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None = None
    trainee_id: uuid.UUID | None
    verified_name: str | None = None
    verified_phone_masked: str | None = None
    status: str
    matched_by: str | None
    determined_grade_id: uuid.UUID | None
    review_note: str | None
    reviewed_at: datetime | None
    created_at: datetime

    @classmethod
    def from_orm(cls, review) -> "IdentityReviewResponse":
        iv = review.identity_verification
        phone = None
        if iv and iv.verified_phone_encrypted:
            phone = mask_phone(decrypt_field(iv.verified_phone_encrypted))
        return cls(
            id=review.id,
            identity_verification_id=review.identity_verification_id,
            user_id=review.user_id,
            user_name=review.user.name if review.user else None,
            trainee_id=review.trainee_id,
            verified_name=iv.verified_name if iv else None,
            verified_phone_masked=phone,
            status=review.status,
            matched_by=review.matched_by,
            determined_grade_id=review.determined_grade_id,
            review_note=review.review_note,
            reviewed_at=review.reviewed_at,
            created_at=review.created_at,
        )


class ReviewApproveRequest(BaseModel):
    trainee_id: uuid.UUID
    determined_grade_id: uuid.UUID | None = None


class ReviewRejectRequest(BaseModel):
    review_note: str
