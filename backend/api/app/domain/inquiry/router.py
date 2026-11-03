import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.inquiry.schema import (
    GuestInquiryCreate,
    GuestInquiryLookup,
    InquiryAdminDetail,
    InquiryAdminListItem,
    InquiryAnswerRequest,
    InquiryCreatedResponse,
    InquiryResponse,
    MemberInquiryAuthor,
    MemberInquiryCreate,
    UnresolvedCountResponse,
)
from app.domain.inquiry.service import inquiry_service
from app.domain.user.model import User

# 교육생(회원) — PASS 로그인 세션
member_router = APIRouter(prefix="/me/inquiries", tags=["inquiries"])
# 교육생(비회원) — 인증 없음, IP rate limit
public_router = APIRouter(prefix="/public/inquiries", tags=["inquiries"])
# 관리자 문의함
admin_router = APIRouter(prefix="/inquiries", tags=["inquiries"])


@member_router.post("", response_model=InquiryCreatedResponse, status_code=201)
async def create_member_inquiry(
    body: MemberInquiryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inquiry = await inquiry_service.create_member_inquiry(db, user, body)
    return InquiryCreatedResponse(id=inquiry.id, created_at=inquiry.created_at)


@member_router.get("/author", response_model=MemberInquiryAuthor)
async def get_member_author(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await inquiry_service.get_member_author(db, user)


@member_router.get("", response_model=list[InquiryResponse])
async def list_member_inquiries(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return [InquiryResponse.from_orm(i) for i in await inquiry_service.list_member_inquiries(db, user)]


@public_router.post("", response_model=InquiryCreatedResponse, status_code=201)
async def create_guest_inquiry(
    body: GuestInquiryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    inquiry = await inquiry_service.create_guest_inquiry(db, request, body)
    if inquiry is None:
        # 봇(숨은 칸 채움) — 저장하지 않았지만 성공한 척 응답해 재시도를 유도하지 않는다
        # 실제 응답(DB timestamptz → UTC)과 같은 형식으로 — 구분되지 않게
        return InquiryCreatedResponse(id=uuid.uuid4(), created_at=datetime.now(UTC))
    return InquiryCreatedResponse(id=inquiry.id, created_at=inquiry.created_at)


@public_router.post("/lookup", response_model=list[InquiryResponse])
async def lookup_guest_inquiries(
    body: GuestInquiryLookup,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return [
        InquiryResponse.from_orm(i)
        for i in await inquiry_service.lookup_guest_inquiries(db, request, body)
    ]


@admin_router.get("", response_model=PagedResponse[InquiryAdminListItem])
async def list_inquiries(
    status: str | None = Query(None, pattern="^(open|answered)$"),
    category: str | None = None,
    author_type: str | None = Query(None, pattern="^(member|guest)$"),
    search: str | None = Query(None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    items, total = await inquiry_service.list_admin_inquiries(
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
    return PagedResponse(items=items, total=total, page=page, limit=limit)


@admin_router.get("/unresolved-count", response_model=UnresolvedCountResponse)
async def unresolved_count(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return UnresolvedCountResponse(count=await inquiry_service.count_unresolved(db))


@admin_router.get("/{inquiry_id}", response_model=InquiryAdminDetail)
async def get_inquiry(
    inquiry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return await inquiry_service.get_admin_detail(db, inquiry_id)


@admin_router.put("/{inquiry_id}/answer", response_model=InquiryAdminDetail)
async def answer_inquiry(
    inquiry_id: uuid.UUID,
    body: InquiryAnswerRequest,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return await inquiry_service.answer_inquiry(db, inquiry_id, body.answer, actor)
