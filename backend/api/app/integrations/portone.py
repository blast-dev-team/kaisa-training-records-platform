"""PortOne v2 API 클라이언트 — 본인인증·결제.

로컬/테스트는 키가 비어 있으므로 서비스 레이어에서 미설정 여부를 먼저 검사한다.
응답 필드명(status, verified_customer 등)은 PortOne v2 문서 기준이며,
Phase 7 목킹 테스트와 스테이징 연동 시 실제 응답과 대조해 확정한다.
"""

import hashlib
import hmac
import time
from typing import Any

import httpx

from app.core.config import settings

_AUTH_HEADERS = {"Authorization": f"ApiKey {settings.PORTONE_API_SECRET}"}


async def create_identity_verification() -> dict[str, Any]:
    """본인인증 세션 생성 → {id, redirect_url, status, ...}."""
    async with httpx.AsyncClient(
        base_url=settings.PORTONE_API_BASE, timeout=10
    ) as client:
        resp = await client.post(
            "/identity-verifications",
            headers=_AUTH_HEADERS,
            json={
                "store_id": settings.PORTONE_STORE_ID,
                "channel_key": settings.PORTONE_IDENTITY_CHANNEL_KEY,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def get_identity_verification(verification_id: str) -> dict[str, Any]:
    """본인인증 결과 단일 조회 (single-fetch). VERIFIED 시 ci/di 포함."""
    async with httpx.AsyncClient(
        base_url=settings.PORTONE_API_BASE, timeout=10
    ) as client:
        resp = await client.get(
            f"/identity-verifications/{verification_id}",
            headers=_AUTH_HEADERS,
        )
        resp.raise_for_status()
        return resp.json()


def verify_webhook_signature(signature: str, body: bytes) -> bool:
    """웹훅 서명 검증 — `t={ts},v1={hmac}` 형식.

    재전송 방지를 위해 타임스탬프가 5분 이내인 경우만 통과.
    서명 형식이 실제와 다르면 Phase 6 웹훅 연동 시점에 맞춘다 (이중 방어:
    상태 변경은 항상 single-fetch 후라 서명 우회는 재요청 유발에 그침).
    """
    try:
        parts = dict(p.split("=", 1) for p in signature.split(","))
        timestamp, received = parts["t"], parts["v1"]
    except (ValueError, KeyError):
        return False
    if abs(time.time() - float(timestamp)) > 300:
        return False
    payload = f"{timestamp}.".encode() + body
    expected = hmac.new(
        settings.PORTONE_WEBHOOK_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, received)


async def get_payment(payment_id: str) -> dict[str, Any]:
    """결제 단일 조회 (single-fetch)."""
    async with httpx.AsyncClient(
        base_url=settings.PORTONE_API_BASE, timeout=10
    ) as client:
        resp = await client.get(f"/payments/{payment_id}", headers=_AUTH_HEADERS)
        resp.raise_for_status()
        return resp.json()


async def cancel_payment(payment_id: str, reason: str) -> dict[str, Any]:
    """결제 취소(환불)."""
    async with httpx.AsyncClient(
        base_url=settings.PORTONE_API_BASE, timeout=10
    ) as client:
        resp = await client.post(
            f"/payments/{payment_id}/cancel",
            headers=_AUTH_HEADERS,
            json={"reason": reason},
        )
        resp.raise_for_status()
        return resp.json()
