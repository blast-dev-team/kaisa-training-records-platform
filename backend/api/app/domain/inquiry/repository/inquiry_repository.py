import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import name_hash
from app.core.kst import KST
from app.domain.inquiry.model import Inquiry


async def get(db: AsyncSession, inquiry_id: uuid.UUID) -> Inquiry | None:
    return await db.get(Inquiry, inquiry_id)


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Inquiry]:
    stmt = (
        select(Inquiry)
        .where(Inquiry.user_id == user_id)
        .order_by(Inquiry.created_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


GUEST_LOOKUP_MAX_CANDIDATES = 20


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_guest_candidates(
    db: AsyncSession, name_hash_value: str, phone_hash_value: str
) -> list[Inquiry]:
    """비회원 조회 후보 — 성명·연락처가 같은 비회원 문의. 비밀번호는 서비스에서 건별 검증."""
    stmt = (
        select(Inquiry)
        .where(
            Inquiry.user_id.is_(None),
            Inquiry.password_hash.is_not(None),
            Inquiry.author_name_hash == name_hash_value,
            Inquiry.author_phone_hash == phone_hash_value,
        )
        .order_by(Inquiry.created_at.desc())
        # 후보마다 pbkdf2 검증을 하므로 상한을 둔다(같은 성명·연락처로 행을 쌓아 CPU 를 묶는 공격 방어)
        .limit(GUEST_LOOKUP_MAX_CANDIDATES)
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_admin(
    db: AsyncSession,
    *,
    status: str | None,
    category: str | None,
    author_type: str | None,
    search: str | None,
    date_from: date | None,
    date_to: date | None,
    page: int,
    limit: int,
) -> tuple[list[Inquiry], int]:
    conditions = []
    if status:
        conditions.append(Inquiry.status == status)
    if category:
        conditions.append(Inquiry.category == category)
    if author_type == "member":
        conditions.append(Inquiry.user_id.is_not(None))
    elif author_type == "guest":
        conditions.append(Inquiry.user_id.is_(None))
    if search and search.strip():
        q = search.strip()
        # 성명은 암호화 저장 — blind index 로 '전체 일치'만 찾는다. 제목은 부분 일치
        conditions.append(
            or_(
                Inquiry.title.ilike(f"%{_escape_like(q)}%", escape="\\"),
                Inquiry.author_name_hash == name_hash(q),
            )
        )
    if date_from:
        conditions.append(Inquiry.created_at >= datetime.combine(date_from, time.min, KST))
    if date_to:
        conditions.append(
            Inquiry.created_at < datetime.combine(date_to + timedelta(days=1), time.min, KST)
        )

    where = and_(*conditions) if conditions else true()
    total = (await db.execute(select(func.count()).select_from(Inquiry).where(where))).scalar_one()
    stmt = (
        select(Inquiry)
        .where(where)
        .order_by(Inquiry.created_at.desc(), Inquiry.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all()), total


async def count_unresolved(db: AsyncSession) -> int:
    stmt = select(func.count()).select_from(Inquiry).where(Inquiry.status == "open")
    return (await db.execute(stmt)).scalar_one()


async def list_same_author(db: AsyncSession, inquiry: Inquiry) -> list[Inquiry]:
    """같은 문의자의 다른 문의 — 회원 계정 일치 또는 (성명 해시 + 연락처 해시) 일치."""
    same = []
    if inquiry.user_id:
        same.append(Inquiry.user_id == inquiry.user_id)
    if inquiry.author_phone_hash:
        same.append(
            and_(
                Inquiry.author_name_hash == inquiry.author_name_hash,
                Inquiry.author_phone_hash == inquiry.author_phone_hash,
            )
        )
    if not same:
        return []
    stmt = (
        select(Inquiry)
        .where(Inquiry.id != inquiry.id, or_(*same))
        .order_by(Inquiry.created_at.desc())
        .limit(50)
    )
    return list((await db.execute(stmt)).scalars().all())
