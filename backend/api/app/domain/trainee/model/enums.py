import enum


class TraineeReviewStatus(str, enum.Enum):
    """교육생 매칭·등급 판별 상태 — 로그인 제어 아님 (v1.1 승인 게이트 제거)."""

    unverified = "unverified"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class SupervisorGrade(str, enum.Enum):
    """감리원 등급 — 확인서 표기용. 회원등급(결제 단가)과 별개.

    저장은 String 컬럼(한글 값 그대로). 승격 시 새 감리원증 번호(senior_cert_no)를
    받으므로 번호 유무가 곧 등급 — 저장 시점에 파생한다(service 참조).
    """

    supervisor = "감리원"
    senior = "수석감리원"
