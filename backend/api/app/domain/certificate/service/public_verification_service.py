"""공개 진위확인 — 인증 없음. 마스킹 응답 + 모든 시도 로그(IP 해시)."""

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import hash_ip, mask_name
from app.core.dependencies import get_client_ip
from app.core.error_codes import api_error
from app.core.kst import now_kst, to_kst_date
from app.core.rate_limit import is_rate_limited, register_attempt
from app.domain.certificate.model import CertificateVerificationLog
from app.domain.certificate.repository import certificate_repository as repo
from app.domain.certificate.schema import (
    PublicVerificationRecordRow,
    PublicVerificationRequest,
    PublicVerificationResponse,
)


async def verify_certificate(
    db: AsyncSession, request: Request, data: PublicVerificationRequest
) -> PublicVerificationResponse:
    ip = get_client_ip(request)
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

    # 묶음 확인서 — 같은 묶음 번호의 유효 멤버가 진위확인 대상. 개별 번호로
    # 조회해도 번호가 속한 묶음 전체가 반환된다 (paper 에 찍힌 번호가 묶음 번호)
    members = await repo.find_bundle_members(db, certificate)
    if not members:
        members = [certificate]

    if certificate.status == "revoked" and all(
        member.status == "revoked" for member in members
    ):
        await _log("revoked", certificate.id)
        await db.commit()
        return PublicVerificationResponse(
            result="revoked",
            certificate_no=certificate.certificate_no,
            message="폐기된 확인서예요",
        )

    head = members[0]
    result = "valid"
    if head.expires_at is not None and head.expires_at < now:
        result = "expired"
    await _log(result, certificate.id)
    await db.commit()

    return PublicVerificationResponse(
        result=result,
        certificate_no=certificate.certificate_no,
        issued_name_masked=mask_name(head.issued_name),
        course_name=head.course_name,
        total_hours=head.total_hours,
        training_ended_at=head.training_ended_at,
        issued_at=to_kst_date(head.issued_at),
        expires_at=(
            to_kst_date(head.expires_at) if head.expires_at else None
        ),
        records=[
            PublicVerificationRecordRow(
                course_name=member.course_name,
                institution_name=member.institution_name,
                total_hours=member.total_hours,
                training_ended_at=member.training_ended_at,
            )
            for member in members
        ],
    )
