import asyncio
import uuid
from datetime import date

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import settings
from app.core.crypto import (
    decrypt_field,
    encrypt_field,
    hash_ip,
    mask_phone,
    name_columns,
    name_hash,
    normalize_phone,
    phone_hash,
)
from app.core.dependencies import get_client_ip
from app.core.error_codes import api_error
from app.core.kst import now_kst
from app.core.rate_limit import try_acquire
from app.core.security import hash_password, verify_password
from app.domain.auth.model import AdminUser
from app.domain.inquiry.model import Inquiry
from app.domain.inquiry.repository import inquiry_repository as repo
from app.domain.inquiry.schema import (
    GuestInquiryCreate,
    GuestInquiryLookup,
    InquiryAdminDetail,
    InquiryAdminListItem,
    InquiryHistoryItem,
    MemberInquiryAuthor,
    MemberInquiryCreate,
)
from app.domain.trainee.model import Trainee
from app.domain.user.model import User

_LOOKUP_NOT_FOUND = "일치하는 문의가 없어요. 성명·연락처·비밀번호를 확인해 주세요"
# 후보가 없을 때도 같은 비용의 검증을 한 번 해 응답 시간으로 '이 사람이 문의했는지' 새지 않게
_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing")


# ── 교육생(회원) ──────────────────────────────────────────────────────────────


class _MemberAuthor:
    """회원 문의자 정보 — 화면에 미리 보여 주는 값과 저장하는 값을 한 곳에서 만든다."""

    def __init__(self, trainee: Trainee | None, name: str, phone: str | None):
        self.trainee = trainee
        self.name = name
        self.phone = phone
        self.cert_no = (trainee.cert_no or trainee.senior_cert_no) if trainee else None
        self.email = trainee.email if trainee else None


async def _member_author(db: AsyncSession, user: User) -> _MemberAuthor:
    """연결된 감리원 정보 우선, 없으면(심사 중) 계정 이름만 — trainee 는 선택이다."""
    trainee = (
        await db.execute(
            select(Trainee).where(Trainee.user_id == user.id, Trainee.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    name = decrypt_field(trainee.name_encrypted) if trainee else decrypt_field(user.name_encrypted)
    phone = (
        decrypt_field(trainee.phone_encrypted) if trainee and trainee.phone_encrypted else None
    )
    return _MemberAuthor(trainee, name or "회원", normalize_phone(phone) or None)


async def get_member_author(db: AsyncSession, user: User) -> MemberInquiryAuthor:
    author = await _member_author(db, user)
    return MemberInquiryAuthor(
        name=author.name,
        cert_no=author.cert_no,
        phone_masked=mask_phone(author.phone),
    )


async def create_member_inquiry(
    db: AsyncSession, user: User, data: MemberInquiryCreate
) -> Inquiry:
    """회원 문의 — 문의자 정보는 연결된 감리원(없으면 계정) 정보로 채운다."""
    author = await _member_author(db, user)
    trainee = author.trainee
    name_enc, name_h = name_columns(author.name)
    phone_digits = author.phone
    inquiry = Inquiry(
        category=data.category,
        title=data.title,
        content=data.content,
        status="open",
        user_id=user.id,
        trainee_id=trainee.id if trainee else None,
        author_name_encrypted=name_enc,
        author_name_hash=name_h,
        author_phone_encrypted=encrypt_field(phone_digits),
        author_phone_hash=phone_hash(phone_digits),
        author_cert_no=author.cert_no,
        author_email=author.email,
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)
    return inquiry


async def list_member_inquiries(db: AsyncSession, user: User) -> list[Inquiry]:
    return await repo.list_by_user(db, user.id)


# ── 교육생(비회원) ────────────────────────────────────────────────────────────


def _acquire(key: str, max_attempts: int, window: int) -> None:
    """확인+기록을 원자적으로 — 동시 요청이 한도를 함께 넘지 못하게 await 전에 부른다."""
    if not try_acquire(key, max_attempts=max_attempts, window_seconds=window):
        raise api_error(
            "TOO_MANY_ATTEMPTS",
            message="요청이 너무 많아요. 잠시 후 다시 시도해 주세요",
        )


def _ip_key(request: Request, kind: str) -> str:
    return f"inquiry_{kind}:{hash_ip(get_client_ip(request))}"


async def create_guest_inquiry(
    db: AsyncSession, request: Request, data: GuestInquiryCreate
) -> Inquiry | None:
    """비회원 문의. 숨은 칸이 채워진 봇 요청은 저장하지 않고 None — 라우터가 성공한 척 응답한다.

    봇 판별은 동의·횟수 검사 뒤에 한다 — 응답(422·429)으로 숨은 칸을 들키지 않게.
    """
    if not data.privacy_agreed:
        raise api_error("VALIDATION_ERROR", message="개인정보 수집·이용에 동의해 주세요")
    _acquire(
        _ip_key(request, "create"),
        settings.RATE_LIMIT_INQUIRY_CREATE_MAX,
        settings.RATE_LIMIT_INQUIRY_CREATE_WINDOW,
    )
    # pbkdf2 는 CPU 를 오래 쓴다 — 워커 1개 구조라 이벤트 루프를 막지 않게 스레드에서
    password_hash = await asyncio.to_thread(hash_password, data.password)
    if data.website:
        return None

    name_enc, name_h = name_columns(data.name)
    inquiry = Inquiry(
        category=data.category,
        title=data.title,
        content=data.content,
        status="open",
        author_name_encrypted=name_enc,
        author_name_hash=name_h,
        author_phone_encrypted=encrypt_field(data.phone),
        author_phone_hash=phone_hash(data.phone),
        author_cert_no=data.cert_no,
        author_email=str(data.email) if data.email else None,
        password_hash=password_hash,
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)
    return inquiry


def _verify_candidates(password: str, candidates: list[Inquiry]) -> list[Inquiry]:
    if not candidates:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        return []
    return [i for i in candidates if verify_password(password, i.password_hash or "")]


async def lookup_guest_inquiries(
    db: AsyncSession, request: Request, data: GuestInquiryLookup
) -> list[Inquiry]:
    """성명+연락처가 같은 비회원 문의 중 비밀번호가 맞는 것만 돌려준다.

    문의마다 비밀번호가 다를 수 있어 건별로 검증한다. 하나도 없으면 어느 값이
    틀렸는지 알리지 않고 같은 404.
    비밀번호 대입 방어: 성공·실패 모두 IP 기준 + 대상(성명+연락처) 기준으로 센다 —
    IP 를 바꿔 가며 한 사람을 노리는 시도도 막는다.
    """
    window = settings.RATE_LIMIT_INQUIRY_LOOKUP_WINDOW
    limit = settings.RATE_LIMIT_INQUIRY_LOOKUP_MAX
    name_h = name_hash(data.name)
    phone_h = phone_hash(data.phone)
    _acquire(_ip_key(request, "lookup"), limit, window)
    _acquire(f"inquiry_lookup_target:{name_h}:{phone_h or '-'}", limit, window)

    candidates = await repo.list_guest_candidates(db, name_h, phone_h) if phone_h else []
    found = await asyncio.to_thread(_verify_candidates, data.password, candidates)
    if not found:
        raise api_error("NOT_FOUND", message=_LOOKUP_NOT_FOUND)
    return found


# ── 관리자 ────────────────────────────────────────────────────────────────────


async def _admin_names(db: AsyncSession, inquiries: list[Inquiry]) -> dict[uuid.UUID, str]:
    ids = {i.answered_by for i in inquiries if i.answered_by}
    if not ids:
        return {}
    rows = await db.execute(select(AdminUser.id, AdminUser.name, AdminUser.email).where(AdminUser.id.in_(ids)))
    return {aid: (name or email) for aid, name, email in rows.all()}


def _list_item(inquiry: Inquiry, admin_names: dict[uuid.UUID, str]) -> dict:
    return {
        "id": inquiry.id,
        "category": inquiry.category,
        "title": inquiry.title,
        "status": inquiry.status,
        "author_name": decrypt_field(inquiry.author_name_encrypted) or "",
        "is_member": inquiry.user_id is not None,
        "answered_by_name": admin_names.get(inquiry.answered_by) if inquiry.answered_by else None,
        "answered_at": inquiry.answered_at,
        "created_at": inquiry.created_at,
    }


async def list_admin_inquiries(
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
) -> tuple[list[InquiryAdminListItem], int]:
    inquiries, total = await repo.list_admin(
        db,
        status=status,
        category=category,
        author_type=author_type,
        search=search,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )
    names = await _admin_names(db, inquiries)
    return [InquiryAdminListItem(**_list_item(i, names)) for i in inquiries], total


async def count_unresolved(db: AsyncSession) -> int:
    return await repo.count_unresolved(db)


async def _get_or_404(db: AsyncSession, inquiry_id: uuid.UUID) -> Inquiry:
    inquiry = await repo.get(db, inquiry_id)
    if inquiry is None:
        raise api_error("NOT_FOUND", message="문의를 찾을 수 없어요")
    return inquiry


async def get_admin_detail(db: AsyncSession, inquiry_id: uuid.UUID) -> InquiryAdminDetail:
    inquiry = await _get_or_404(db, inquiry_id)
    history = await repo.list_same_author(db, inquiry)
    names = await _admin_names(db, [inquiry, *history])
    trainee_no = None
    if inquiry.trainee_id:
        trainee = await db.get(Trainee, inquiry.trainee_id)
        trainee_no = trainee.trainee_no if trainee else None
    return InquiryAdminDetail(
        **_list_item(inquiry, names),
        content=inquiry.content,
        answer=inquiry.answer,
        author_phone=decrypt_field(inquiry.author_phone_encrypted),
        author_cert_no=inquiry.author_cert_no,
        author_email=inquiry.author_email,
        trainee_id=inquiry.trainee_id,
        trainee_no=trainee_no,
        updated_at=inquiry.updated_at,
        history=[
            InquiryHistoryItem(
                **_list_item(h, names),
                content=h.content,
                answer=h.answer,
                matched_by=(
                    "account"
                    if inquiry.user_id is not None and h.user_id == inquiry.user_id
                    else "name_phone"
                ),
            )
            for h in history
        ],
    )


async def answer_inquiry(
    db: AsyncSession, inquiry_id: uuid.UUID, answer: str, actor: AdminUser
) -> InquiryAdminDetail:
    """답변 등록·수정 — 상태를 answered 로 바꾸고 마지막 답변자·시각을 남긴다."""
    inquiry = await _get_or_404(db, inquiry_id)
    was_answered = inquiry.status == "answered"
    before = {"status": inquiry.status, "answer": inquiry.answer}
    inquiry.answer = answer
    inquiry.status = "answered"
    inquiry.answered_by = actor.id
    inquiry.answered_at = now_kst()
    record_audit(
        db,
        actor_admin_id=actor.id,
        action="inquiry.answer_updated" if was_answered else "inquiry.answered",
        entity_type="inquiry",
        entity_id=inquiry.id,
        # 수정 전 답변을 남겨 교육생에게 보였던 내용을 되짚을 수 있게
        before=before,
        after={"status": "answered", "answer": answer},
    )
    await db.commit()
    # updated_at 은 DB 가 갱신(onupdate) — 다시 읽어야 비동기 세션에서 lazy load 가 안 난다
    await db.refresh(inquiry)
    return await get_admin_detail(db, inquiry_id)
