"""단위 — PortOne V2 웹훅 서명 검증 (무DB). Standard Webhooks 규격.

헤더 `webhook-id` / `webhook-timestamp` / `webhook-signature: v1,<base64>`,
서명 대상 `{id}.{timestamp}.{본문}`, 키 = base64(`whsec_` 뒤).
"""

import base64
import time

from app.core.config import settings
from app.integrations.portone import verify_webhook_signature
from tests.integration.helpers import portone_webhook_headers

_BODY = b'{"type":"Transaction.Paid","data":{"paymentId":"ORD-1"}}'
_ID = "msg_test_1"


def _verify(headers: dict[str, str], body: bytes = _BODY) -> bool:
    return verify_webhook_signature(
        headers["webhook-id"],
        headers["webhook-timestamp"],
        headers["webhook-signature"],
        body,
    )


class TestVerifyWebhookSignature:
    def test_valid_signature(self):
        assert _verify(portone_webhook_headers(_BODY, _ID))

    def test_wrong_secret_rejected(self):
        other = "whsec_" + base64.b64encode(b"other-secret").decode()
        assert not _verify(portone_webhook_headers(_BODY, _ID, secret=other))

    def test_body_tampered_rejected(self):
        assert not _verify(portone_webhook_headers(_BODY, _ID), _BODY + b"x")

    def test_webhook_id_is_signed(self):
        headers = portone_webhook_headers(_BODY, _ID)
        headers["webhook-id"] = "msg_other"
        assert not _verify(headers)

    def test_stale_timestamp_rejected(self):
        old = int(time.time()) - 301
        assert not _verify(portone_webhook_headers(_BODY, _ID, timestamp=old))

    def test_future_timestamp_beyond_tolerance_rejected(self):
        future = int(time.time()) + 301
        assert not _verify(portone_webhook_headers(_BODY, _ID, timestamp=future))

    def test_within_tolerance_accepted(self):
        recent = int(time.time()) - 299
        assert _verify(portone_webhook_headers(_BODY, _ID, timestamp=recent))

    def test_any_of_multiple_signatures_accepted(self):
        """시크릿 교체 기간엔 서명이 공백으로 여러 개 온다 — 하나만 맞으면 통과."""
        headers = portone_webhook_headers(_BODY, _ID)
        headers["webhook-signature"] = "v1,AAAA " + headers["webhook-signature"]
        assert _verify(headers)

    def test_malformed_signature_rejected(self):
        ts = str(int(time.time()))
        assert not verify_webhook_signature(_ID, ts, "", _BODY)
        assert not verify_webhook_signature(_ID, ts, "garbage", _BODY)
        assert not verify_webhook_signature(_ID, "abc", "v1,xyz", _BODY)
        assert not verify_webhook_signature("", ts, "v1,xyz", _BODY)

    def test_empty_secret_always_rejected(self, monkeypatch):
        """시크릿이 비면 키가 b"" 라 누구나 서명을 만들 수 있다 — fail-closed."""
        forged = portone_webhook_headers(_BODY, _ID, secret="whsec_")
        monkeypatch.setattr(settings, "PORTONE_WEBHOOK_SECRET", "")
        assert not _verify(forged)
