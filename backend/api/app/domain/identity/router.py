import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.core.response import PagedResponse
from app.domain.auth.model import AdminUser
from app.domain.identity.schema import (
    IdentityReviewResponse,
    ReviewApproveRequest,
    ReviewRejectRequest,
)
from app.domain.identity.service import identity_service

review_router = APIRouter(prefix="/identity-reviews", tags=["identity-reviews"])


@review_router.get("", response_model=PagedResponse[IdentityReviewResponse])
async def list_reviews(
    status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    reviews, total = await identity_service.list_reviews(
        db, status=status, page=page, limit=limit
    )
    return PagedResponse(
        items=[IdentityReviewResponse.from_orm(r) for r in reviews],
        total=total,
        page=page,
        limit=limit,
    )


@review_router.post("/{review_id}/approve", response_model=IdentityReviewResponse)
async def approve_review(
    review_id: uuid.UUID,
    body: ReviewApproveRequest,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return IdentityReviewResponse.from_orm(
        await identity_service.approve_review(
            db, review_id, body.trainee_id, body.determined_grade_id, actor
        )
    )


@review_router.post("/{review_id}/reject", response_model=IdentityReviewResponse)
async def reject_review(
    review_id: uuid.UUID,
    body: ReviewRejectRequest,
    db: AsyncSession = Depends(get_db),
    actor: AdminUser = Depends(require_admin),
):
    return IdentityReviewResponse.from_orm(
        await identity_service.reject_review(db, review_id, body.review_note, actor)
    )
