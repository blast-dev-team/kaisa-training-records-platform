"""공개 진위확인 — 인증 없음. 마스킹 응답 + 모든 시도 로그(IP 해시)."""

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import hash_ip, mask_name
from app.core.error_codes import api_error
from app.core.kst import now_kst, to_kst_date
from app.core.rate_limit import is_rate_limited, register_attempt
from app.domain.certificate.model import CertificateVerificationLog
from app.domain.certificate.repository import certificate_repository as repo
from app.domain.certificate.schema import (
    PublicVerificationRequest,
    PublicVerificationResponse,
)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def verify_certificate(
    db: AsyncSession, request: Request, data: PublicVerificationRequest
) -> PublicVerificationResponse:
    ip = _client_ip(request)
    ip_hash = hash_ip(ip)
    if is_rate_limited(
        f"public_verify:{ip_hash}",
        max_attempts=settings.RATE_LIMIT_PUBLIC_VERIFY_MAX,
        window_seconds=settings.RATE_LIMIT_PUBLIC_VERIFY_WINDOW,
    ):
        raise api_error(
            "TOO_MANY_ATTEMPTS",
            message="조회 시도가 너무 많아요. 잠시 후 다시 시도해 주세요",
        )
    register_attempt(
        f"public_verify:{ip_hash}",
        window_seconds=settings.RATE_LIMIT_PUBLIC_VERIFY_WINDOW,
    )

    certificate = await repo.find_by_no(db, data.certificate_no.strip())
    now = now_kst()

    async def _log(result: str, cert_id=None) -> None:
        db.add(
            CertificateVerificationLog(
                certificate_id=cert_id,
                input_certificate_no=data.certificate_no.strip(),
                input_issue_date=data.issue_date,
                result=result,
                requester_ip_hash=ip_hash,
                verified_at=now,
            )
        )

    if certificate is None:
        await _log("not_found")
        await db.commit()
        return PublicVerificationResponse(
            result="not_found", message="등록되지 않은 확인서 번호예요"
        )

    # 발급일 불일치 → mismatch (존재 누출 방지를 위해 not_found 와 동일한 취급)
    if to_kst_date(certificate.issued_at) != data.issue_date:
        await _log("mismatch", certificate.id)
        await db.commit()
        return PublicVerificationResponse(
            result="mismatch", message="확인서 정보가 일치하지 않아요"
        )

    if certificate.status == "revoked":
        await _log("revoked", certificate.id)
        await db.commit()
        return PublicVerificationResponse(
            result="revoked",
            certificate_no=certificate.certificate_no,
            message="폐기된 확인서예요",
        )

    result = "valid"
    if certificate.expires_at is not None and certificate.expires_at < now:
        result = "expired"
    await _log(result, certificate.id)
    await db.commit()

    return PublicVerificationResponse(
        result=result,
        certificate_no=certificate.certificate_no,
        issued_name_masked=mask_name(certificate.issued_name),
        course_name=certificate.course_name,
        issued_at=to_kst_date(certificate.issued_at),
        expires_at=(
            to_kst_date(certificate.expires_at) if certificate.expires_at else None
        ),
    )
