"""어드민 — 확인서 목록·폐기·발급 저장."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.certificate.model import Certificate, CertificateRequest
from app.domain.certificate.repository import certificate_repository as repo
from app.domain.certificate.service import issuance_service
from app.domain.certificate.service.request_service import _request_no
from app.domain.trainee.model import Trainee
from app.domain.training_record.model import TrainingRecord


async def list_certificates(
    db: AsyncSession,
    trainee_id: uuid.UUID | None = None,
    status: str | None = None,
    search: str | None = None,
    date_from=None,
    date_to=None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Certificate], int]:
    return await repo.list_certificates(
        db,
        trainee_id=trainee_id,
        status=status,
        search=search,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )


async def revoke_certificate(
    db: AsyncSession, certificate_id: uuid.UUID, reason: str, actor: AdminUser
) -> Certificate:
    certificate = await repo.find_by_id(db, certificate_id)
    if certificate is None:
        raise api_error("NOT_FOUND", message="확인서를 찾을 수 없어요")
    if certificate.status != "issued":
        raise api_error(
            "INVALID_STATUS_TRANSITION",
            message="유효한 상태의 확인서만 폐기할 수 있어요",
        )

    # 묶음 확인서는 번호가 하나라 부분 폐기가 의미 없다 — 전 멤버를 함께 폐기.
    # issued 인 certificate 가 호출 조건이라 find_bundle_members 에 반드시 포함된다
    bundle_members = await repo.find_bundle_members(db, certificate)

    now = now_kst()
    for member in bundle_members:
        member.status = "revoked"
        member.revoked_at = now
        member.revoked_reason = reason
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="certificate.revoked",
            entity_type="certificate",
            entity_id=member.id,
            before={"status": "issued"},
            after={"status": "revoked", "reason": reason},
        )
    await db.commit()
    await db.refresh(certificate)
    return certificate


async def _find_active_certificate_by_record(
    db: AsyncSession, record_id: uuid.UUID
) -> Certificate | None:
    return (
        await db.execute(
            select(Certificate).where(
                Certificate.training_record_id == record_id,
                Certificate.status == "issued",
            )
        )
    ).scalar_one_or_none()


async def issue_certificates(
    db: AsyncSession,
    groups: list[tuple[uuid.UUID, list[uuid.UUID]]],
    actor: AdminUser,
) -> list[dict]:
    """어드민 발급 저장 — 감리원별 그룹(=문서 1건)씩 발급을 확정한다.

    WEB 발급과 동일한 request→certificate 파이프라인을 쓰되 결제가 없다
    (amount 0, requested_by 는 trainee.user_id — 없으면 NULL).
    문서번호는 그룹(발급 이벤트)당 1회 채번해 멤버 전부에 동일 부여한다.
    이미 유효 확인서가 있는 내역도 새 문서에 그대로 들어간다 — 기존 확인서는
    superseded 로 바뀌고 새 번호를 받는다(WEB 재발급과 같은 규칙). 발급 단위가
    문서이므로 A만 발급했다가 A~Z를 다시 발급하면 두 번째 문서는 A~Z 풀구성이다.
    """
    now = now_kst()
    results: list[dict] = []
    for trainee_id, record_ids in groups:
        trainee = await db.get(Trainee, trainee_id)
        if trainee is None:
            raise api_error("NOT_FOUND", message="교육생을 찾을 수 없어요")
        if trainee.membership_grade_id is None:
            raise api_error(
                "GRADE_NOT_DETERMINED",
                message="회원등급이 판별되지 않은 교육생이에요",
            )

        doc_no = issuance_service.format_doc_no(
            await issuance_service.next_doc_seq(db)
        )
        certificates: list[Certificate] = []
        for record_id in dict.fromkeys(record_ids):  # 요청 내 중복 제거
            record = await db.get(TrainingRecord, record_id)
            if record is None:
                raise api_error("NOT_FOUND", message="교육이력을 찾을 수 없어요")
            if record.trainee_id != trainee.id:
                raise api_error(
                    "VALIDATION_ERROR",
                    message="선택한 이력이 해당 교육생의 것이 아니에요",
                )
            previous = await _find_active_certificate_by_record(db, record_id)
            request = CertificateRequest(
                request_no=_request_no(),
                trainee_id=trainee.id,
                training_record_id=record.id,
                requested_by=trainee.user_id,  # 연결 없는 이관분은 NULL
                issue_type="reissue" if previous else "original",
                previous_certificate_id=previous.id if previous else None,
                membership_grade_id=trainee.membership_grade_id,
                amount_krw=0,
                currency="KRW",
                status="paid",
                requested_at=now,
                paid_at=now,
            )
            db.add(request)
            await db.flush()  # request.id 확정 — issue_certificate 가 참조
            certificates.append(
                await issuance_service.issue_certificate(
                    db, request, doc_no=doc_no
                )
            )
        issuance_service.assign_bundle_no(certificates)
        results.append(
            {
                "trainee_id": trainee_id,
                "doc_no": doc_no,
                "certificate_ids": [c.id for c in certificates],
            }
        )
        record_audit(
            db,
            actor_admin_id=actor.id,
            action="certificate.issued",
            entity_type="certificate",
            entity_id=certificates[0].id,
            after={
                "doc_no": doc_no,
                "trainee_id": str(trainee_id),
                "record_count": len(certificates),
                "source": "admin",
            },
        )
    await db.commit()
    return results
