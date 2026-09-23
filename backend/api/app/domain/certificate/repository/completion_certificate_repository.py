import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.certificate.model import CompletionCertificate


async def find_by_id(
    db: AsyncSession, completion_certificate_id: uuid.UUID
) -> CompletionCertificate | None:
    result = await db.execute(
        select(CompletionCertificate).where(
            CompletionCertificate.id == completion_certificate_id
        )
    )
    return result.scalar_one_or_none()


async def find_by_no(db: AsyncSession, certificate_no: str) -> CompletionCertificate | None:
    result = await db.execute(
        select(CompletionCertificate).where(
            CompletionCertificate.certificate_no == certificate_no
        )
    )
    return result.scalar_one_or_none()


async def find_by_record_ids(
    db: AsyncSession, record_ids: list[uuid.UUID]
) -> dict[uuid.UUID, CompletionCertificate]:
    """이력별 기발급 수료증 — 발급 멱등 판정용."""
    if not record_ids:
        return {}
    result = await db.execute(
        select(CompletionCertificate).where(
            CompletionCertificate.training_record_id.in_(record_ids)
        )
    )
    return {cert.training_record_id: cert for cert in result.scalars()}
