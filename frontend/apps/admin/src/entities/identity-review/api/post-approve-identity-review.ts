import { apiClient } from '@/src/shared/api'
import type { IdentityReviewDto } from './dto/identity-review-dto'
import { mapIdentityReview } from './map-identity-review'
import type { ReviewApproveInput, IdentityReview } from '../model/identity-review'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_IDENTITY_REVIEWS } from './identity-review-mock'
import { findTrainee } from '@/src/entities/trainee/api/trainee-mock'

export const postApproveIdentityReview = async (
  reviewId: string,
  input: ReviewApproveInput,
): Promise<IdentityReview> => {
  if (USE_MOCK) {
    await mockDelay()
    const review = MOCK_IDENTITY_REVIEWS.find(r => r.id === reviewId)
    if (!review) throw new Error('심사 요청을 찾을 수 없어요')
    review.status = 'approved'
    review.traineeId = input.trainee_id
    review.matchedBy = 'adm-001'
    review.determinedGradeId = input.determined_grade_id ?? null
    review.reviewedAt = new Date().toISOString().slice(0, 19)
    // 교육생 심사 상태도 함께 반영 — 실API의 승인 트리거와 동일하게
    const trainee = findTrainee(input.trainee_id)
    if (trainee) {
      trainee.reviewStatus = 'approved'
      trainee.updatedAt = review.reviewedAt
    }
    return { ...review }
  }
  const { data } = await apiClient.post<IdentityReviewDto>(
    `/identity-reviews/${reviewId}/approve`,
    input,
  )
  return mapIdentityReview(data)
}
