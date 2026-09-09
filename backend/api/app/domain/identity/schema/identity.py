import uuid
from datetime import datetime

from pydantic import BaseModel

from app.core.crypto import decrypt_field, mask_phone


class PassStartResponse(BaseModel):
    """PASS 인증 시작 — FE는 redirect_url 로 이동 후 복귀 시 state 로 complete 호출."""

    identity_verification_id: str
    redirect_url: str
    state: str


class PassCompleteRequest(BaseModel):
    state: str


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
