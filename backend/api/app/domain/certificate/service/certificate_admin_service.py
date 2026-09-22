"""어드민 — 확인서 목록·폐기."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.domain.auth.model import AdminUser
from app.domain.certificate.model import Certificate
from app.domain.certificate.repository import certificate_repository as repo


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
