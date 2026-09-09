import enum


class IdentityStatus(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    failed = "failed"
    expired = "expired"


class IdentityReviewStatus(str, enum.Enum):
    """본인인증 후 점검 상태 — 로그인을 제한하지 않는 비동기 점검."""

    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    manual_review = "manual_review"


class MatchedBy(str, enum.Enum):
    ci = "ci"
    legacy_id = "legacy_id"
    manual = "manual"
