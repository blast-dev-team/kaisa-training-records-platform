"""공개 진위확인 — 인증 없음. 마스킹 응답 + 모든 시도 로그(IP 해시).

확인서(문서번호 정감 제{YY}-E{NNNN}호)와 수료증(YYYY-MM-NNN호)을 한
엔드포인트에서 확인한다 — WEB 진위확인 화면이 입력창 하나라 번호 형태로
갈리지 않고 둘 다 조회한다. 확인서는 문서번호로만 조회한다 — 확인서에
문서번호만 인쇄되고 구 확인서 번호(CERT-…)는 더 이상 노출하지 않는다.
"""

import re

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt_field, hash_ip, mask_name
from app.core.dependencies import get_client_ip
from app.core.error_codes import api_error
from app.core.kst import now_kst, to_kst_date
from app.core.rate_limit import is_rate_limited, register_attempt
from app.domain.certificate.model import CertificateVerificationLog
from app.domain.certificate.repository import certificate_repository as repo
from app.domain.certificate.repository import (
    completion_certificate_repository as completion_repo,
)
from app.domain.certificate.schema import (
    PublicVerificationRecordRow,
    PublicVerificationRequest,
    PublicVerificationResponse,
)

# 저장 형식의 변숫부 — YY-E숫자 (하이픈 생략 허용)
_DOC_NO_RE = re.compile(r"(\d{2})-?E(\d{1,4})")


def canonical_doc_no(raw: str) -> str | None:
    """입력을 저장 형식(`정감 제{YY}-E{NNNN}호`)으로 정규화한다.

    띄어쓰기·대소문자·장식문(정감/제/호)·하이픈 유무를 무시한다 —
    `정감 제26-E0001호`, ` 26 - e0001 `, `26E0001` 모두 같은 번호로 본다.
    형식이 아니면 None — not_found 가 아니라 조회 시도조차 하지 않는다.
    """
    compact = re.sub(r"\s+", "", raw).upper()
    compact = compact.replace("정감", "").replace("제", "").replace("호", "")
    match = _DOC_NO_RE.fullmatch(compact)
    if match is None:
        return None
    return f"정감 제{match.group(1)}-E{int(match.group(2)):04d}호"


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

    input_no = data.certificate_no.strip()
    now = now_kst()

    async def _log(result: str, cert_id=None, completion_cert_id=None) -> None:
        db.add(
            CertificateVerificationLog(
                certificate_id=cert_id,
                completion_certificate_id=completion_cert_id,
                input_certificate_no=input_no,
                result=result,
                requester_ip_hash=ip_hash,
                verified_at=now,
            )
        )

    # 문서 종류가 지정되면 해당 테이블만 조회 (WEB 라디오 선택)
    # 확인서는 문서번호로만 조회 — 정규화 실패(형식 불일치)면 조회 없이 not_found
    certificate = None
    if data.doc_type in (None, "certificate"):
        doc_no = canonical_doc_no(input_no)
        if doc_no is not None:
            certificate = await repo.find_by_doc_no(db, doc_no)

    if certificate is not None:
        return await _verify_certificate(db, certificate, _log, now)

    completion = (
        await _find_completion(db, input_no)
        if data.doc_type in (None, "completion_certificate")
        else None
    )
    if completion is not None:
        return await _verify_completion(db, completion, _log)

    await _log("not_found")
    await db.commit()
    return PublicVerificationResponse(
        result="not_found", message="등록되지 않은 번호예요"
    )


async def _find_completion(db: AsyncSession, input_no: str):
    """수료증 번호 조회 — '호' 접미사 유무 양쪽을 시도한다."""
    for candidate in dict.fromkeys((input_no, f"{input_no}호")):
        completion = await completion_repo.find_by_no(db, candidate)
        if completion is not None:
            return completion
    return None


async def _verify_certificate(db, certificate, _log, now) -> PublicVerificationResponse:
    # 응답 번호는 문서번호 — 확인서에 인쇄된 그 번호다 (구 확인서 번호 미노출)
    display_no = certificate.doc_no or certificate.certificate_no

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
            kind="certificate",
            certificate_no=display_no,
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
        kind="certificate",
        certificate_no=display_no,
        issued_name_masked=mask_name(decrypt_field(head.issued_name_encrypted)),
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


async def _verify_completion(db, completion, _log) -> PublicVerificationResponse:
    if completion.status != "issued":
        await _log("revoked", completion_cert_id=completion.id)
        await db.commit()
        return PublicVerificationResponse(
            result="revoked",
            kind="completion_certificate",
            certificate_no=completion.certificate_no,
            message="폐기된 수료증이에요",
        )

    await _log("valid", completion_cert_id=completion.id)
    await db.commit()

    return PublicVerificationResponse(
        result="valid",
        kind="completion_certificate",
        certificate_no=completion.certificate_no,
        issued_name_masked=mask_name(decrypt_field(completion.issued_name_encrypted)),
        course_name=completion.course_name,
        total_hours=completion.completed_hours,
        completed_hours=completion.completed_hours,
        training_started_at=completion.started_at,
        training_ended_at=completion.ended_at,
        trainee_birth_date=completion.trainee_birth_date,
        session_name=completion.session_name,
        issued_at=to_kst_date(completion.issued_at),
    )
