import enum


class TraineeReviewStatus(str, enum.Enum):
    """교육생 매칭·등급 판별 상태 — 로그인 제어 아님 (v1.1 승인 게이트 제거)."""

    unverified = "unverified"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
