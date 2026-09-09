"""단위 — PortOne 웹훅 서명 검증 (무DB). `t={ts},v1={hmac}` 형식."""

import hashlib
import hmac
import time

from app.core.config import settings
from app.integrations.portone import verify_webhook_signature


def _sign(body: bytes, ts: float, secret: str) -> str:
    digest = hmac.new(
        secret.encode(), f"{ts}.".encode() + body, hashlib.sha256
    ).hexdigest()
    return f"t={ts},v1={digest}"


_BODY = b'{"webhookId":"wh-1","type":"Transaction.Paid"}'


class TestVerifyWebhookSignature:
    def test_valid_signature(self):
        ts = time.time()
        assert verify_webhook_signature(
            _sign(_BODY, ts, settings.PORTONE_WEBHOOK_SECRET), _BODY
        )

    def test_wrong_secret_rejected(self):
        ts = time.time()
        assert not verify_webhook_signature(_sign(_BODY, ts, "other-secret"), _BODY)

    def test_body_tampered_rejected(self):
        ts = time.time()
        sig = _sign(_BODY, ts, settings.PORTONE_WEBHOOK_SECRET)
        assert not verify_webhook_signature(sig, _BODY + b"x")

    def test_stale_timestamp_rejected(self):
        sig = _sign(_BODY, time.time() - 301, settings.PORTONE_WEBHOOK_SECRET)
        assert not verify_webhook_signature(sig, _BODY)

    def test_future_timestamp_beyond_tolerance_rejected(self):
        sig = _sign(_BODY, time.time() + 301, settings.PORTONE_WEBHOOK_SECRET)
        assert not verify_webhook_signature(sig, _BODY)

    def test_within_tolerance_accepted(self):
        sig = _sign(_BODY, time.time() - 299, settings.PORTONE_WEBHOOK_SECRET)
        assert verify_webhook_signature(sig, _BODY)

    def test_malformed_signature_rejected(self):
        assert not verify_webhook_signature("", _BODY)
        assert not verify_webhook_signature("garbage", _BODY)
        assert not verify_webhook_signature("t=abc,v1=xyz", _BODY)
