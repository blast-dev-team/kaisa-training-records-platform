import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.model import AdminAllowedEmail, AdminUser


async def find_admin_by_email(db: AsyncSession, email: str) -> AdminUser | None:
    result = await db.execute(select(AdminUser).where(AdminUser.email == email.lower()))
    return result.scalar_one_or_none()


async def list_admin_users(db: AsyncSession) -> list[AdminUser]:
    result = await db.execute(select(AdminUser).order_by(AdminUser.created_at.asc()))
    return list(result.scalars().all())


async def find_allowed_email_by_email(
    db: AsyncSession, email: str
) -> AdminAllowedEmail | None:
    result = await db.execute(
        select(AdminAllowedEmail).where(AdminAllowedEmail.email == email.lower())
    )
    return result.scalar_one_or_none()


async def find_allowed_email_by_id(
    db: AsyncSession, allowed_email_id: uuid.UUID
) -> AdminAllowedEmail | None:
    return await db.get(AdminAllowedEmail, allowed_email_id)


async def list_allowed_emails(db: AsyncSession) -> list[AdminAllowedEmail]:
    result = await db.execute(
        select(AdminAllowedEmail).order_by(AdminAllowedEmail.created_at.desc())
    )
    return list(result.scalars().all())
