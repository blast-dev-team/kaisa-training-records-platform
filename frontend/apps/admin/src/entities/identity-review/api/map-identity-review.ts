import type { IdentityReviewDto } from './dto/identity-review-dto'
import type { IdentityReview } from '../model/identity-review'

export function mapIdentityReview(dto: IdentityReviewDto): IdentityReview {
  return {
    id: dto.id,
    identityVerificationId: dto.identity_verification_id,
    userId: dto.user_id,
    userName: dto.user_name,
    traineeId: dto.trainee_id,
    verifiedName: dto.verified_name,
    verifiedPhoneMasked: dto.verified_phone_masked,
    status: dto.status,
    matchedBy: dto.matched_by,
    determinedGradeId: dto.determined_grade_id,
    reviewNote: dto.review_note,
    reviewedAt: dto.reviewed_at,
    createdAt: dto.created_at,
  }
}
