import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.core.crypto import decrypt_field, mask_phone


class TraineeResponse(BaseModel):
    """전화는 복호화 후 마스킹해 내려준다 (원문 미노출)."""

    id: uuid.UUID
    trainee_no: str | None
    name: str
    phone_masked: str | None
    email: EmailStr | None
    review_status: str
    membership_grade_id: uuid.UUID | None
    grade_name: str | None
    user_id: uuid.UUID | None
    memo: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm(cls, t) -> "TraineeResponse":
        phone = (
            mask_phone(decrypt_field(t.phone_encrypted)) if t.phone_encrypted else None
        )
        return cls(
            id=t.id,
            trainee_no=t.trainee_no,
            name=t.name,
            phone_masked=phone,
            email=t.email,
            review_status=t.review_status,
            membership_grade_id=t.membership_grade_id,
            grade_name=t.grade.name if t.grade else None,
            user_id=t.user_id,
            memo=t.memo,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )


class TraineeUpdate(BaseModel):
    """review_status 는 본인인증 심사(identity) 플로우에서만 변경 — 여기서 다루지 않는다."""

    name: str | None = None
    phone: str | None = None  # 평문 수신 → 암호화 저장
    email: EmailStr | None = None
    memo: str | None = None
    membership_grade_id: uuid.UUID | None = None
    grade_change_reason: str | None = None  # 등급 변경 시 사유 (history 기록용)
