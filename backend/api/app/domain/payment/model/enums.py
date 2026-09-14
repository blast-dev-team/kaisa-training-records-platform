import enum


class PaymentOrderStatus(str, enum.Enum):
    ready = "ready"
    pending = "pending"
    paid = "paid"
    failed = "failed"
    canceled = "canceled"
    partial_refunded = "partial_refunded"
    refunded = "refunded"


class PaymentAttemptStatus(str, enum.Enum):
    ready = "ready"
    pending = "pending"
    paid = "paid"
    failed = "failed"
    canceled = "canceled"


class RefundStatus(str, enum.Enum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"


class WebhookProcessingStatus(str, enum.Enum):
    pending = "pending"
    processed = "processed"
    failed = "failed"
