"""PortOne v2 API 클라이언트 — 본인인증·결제.

로컬/테스트는 키가 비어 있으므로 서비스 레이어에서 미설정 여부를 먼저 검사한다.
응답 필드명(status, verified_customer 등)은 PortOne v2 문서 기준이며,
Phase 7 목킹 테스트와 스테이징 연동 시 실제 응답과 대조해 확정한다.
"""

import base64
import binascii
import hashlib
import hmac
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.error_codes import api_error

# PortOne V2 REST API 인증 — `Authorization: PortOne {API_SECRET}` (V1 ApiKey 아님)
_AUTH_HEADERS = {"Authorization": f"PortOne {settings.PORTONE_API_SECRET}"}


def _check(resp: httpx.Response) -> None:
    """PortOne API 오류 → 502 HTTPException (raw 500 + 스택트레이스 노출 방지)."""
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise api_error("PORTONE_API_ERROR") from e


async def _request(
    method: str, path: str, *, not_found_ok: bool = False, **kwargs: Any
) -> dict[str, Any] | None:
    """PortOne 호출 공통 — 상태 오류뿐 아니라 타임아웃·연결 오류도 PORTONE_API_ERROR 로.

    예전엔 httpx 전송 예외가 그대로 터져 500 이 됐다. 환불 중이라면 PG 는 취소됐는데
    DB 는 롤백되는 불일치가 생겼다 — 호출부가 한 종류의 오류만 다루게 한다.
    """
    try:
        async with httpx.AsyncClient(
            base_url=settings.PORTONE_API_BASE, timeout=10
        ) as client:
            resp = await client.request(method, path, headers=_AUTH_HEADERS, **kwargs)
    except httpx.HTTPError as e:
        raise api_error("PORTONE_API_ERROR") from e
    if not_found_ok and resp.status_code == 404:
        return None
    _check(resp)
    return resp.json()


async def create_identity_verification() -> dict[str, Any]:
    """본인인증 세션 생성 → {id, redirect_url, status, ...}."""
    return await _request(
        "POST",
        "/identity-verifications",
        json={
            "store_id": settings.PORTONE_STORE_ID,
            "channel_key": settings.PORTONE_IDENTITY_CHANNEL_KEY,
        },
    )


async def get_identity_verification(verification_id: str) -> dict[str, Any]:
    """본인인증 결과 단일 조회 (single-fetch). VERIFIED 시 ci/di 포함."""
    return await _request("GET", f"/identity-verifications/{verification_id}")


WEBHOOK_TOLERANCE_SECONDS = 300


def _webhook_key(secret: str) -> bytes:
    """Standard Webhooks 시크릿 → HMAC 키. `whsec_` 접두어 뒤는 base64."""
    raw = secret.removeprefix("whsec_")
    try:
        return base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return raw.encode()


def verify_webhook_signature(
    webhook_id: str, timestamp: str, signature_header: str, body: bytes
) -> bool:
    """PortOne V2 웹훅 서명 검증 — Standard Webhooks 규격.

    헤더 `webhook-id` / `webhook-timestamp` / `webhook-signature`(`v1,<base64>` 를
    공백으로 여러 개). 서명 대상은 `{id}.{timestamp}.{본문}`, HMAC-SHA256.
    시크릿이 비어 있으면 누구나 서명을 만들 수 있으므로 항상 거부한다(fail-closed).
    """
    secret = settings.PORTONE_WEBHOOK_SECRET
    if not secret or not webhook_id or not timestamp or not signature_header:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs(time.time() - ts) > WEBHOOK_TOLERANCE_SECONDS:
        return False
    signed = f"{webhook_id}.{timestamp}.".encode() + body
    expected = base64.b64encode(
        hmac.new(_webhook_key(secret), signed, hashlib.sha256).digest()
    ).decode()
    for part in signature_header.split():
        version, _, received = part.partition(",")
        if version == "v1" and hmac.compare_digest(expected, received):
            return True
    return False


async def get_payment(payment_id: str) -> dict[str, Any] | None:
    """결제 단일 조회 (single-fetch). 결제창을 열지 않은 주문은 PortOne 에 없다 → None."""
    return await _request("GET", f"/payments/{payment_id}", not_found_ok=True)


async def cancel_payment(payment_id: str, reason: str) -> dict[str, Any]:
    """결제 취소(환불)."""
    return await _request(
        "POST", f"/payments/{payment_id}/cancel", json={"reason": reason}
    )
