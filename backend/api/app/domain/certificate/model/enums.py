import enum


class IssueType(str, enum.Enum):
    original = "original"
    reissue = "reissue"


class CertificateRequestStatus(str, enum.Enum):
    pending = "pending"
    payment_pending = "payment_pending"
    paid = "paid"
    issuing = "issuing"
    issued = "issued"
    canceled = "canceled"
    failed = "failed"


class CertificateStatus(str, enum.Enum):
    issued = "issued"
    revoked = "revoked"
    superseded = "superseded"


class VerificationResult(str, enum.Enum):
    valid = "valid"
    expired = "expired"
    revoked = "revoked"
    not_found = "not_found"
    mismatch = "mismatch"
