import { apiClient } from '@/src/shared/api'
import type { IdentityReviewDto } from './dto/identity-review-dto'
import { mapIdentityReview } from './map-identity-review'
import type { ReviewRejectInput, IdentityReview } from '../model/identity-review'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_IDENTITY_REVIEWS } from './identity-review-mock'
import { findTrainee } from '@/src/entities/trainee/api/trainee-mock'

export const postRejectIdentityReview = async (
  reviewId: string,
  input: ReviewRejectInput,
): Promise<IdentityReview> => {
  if (USE_MOCK) {
    await mockDelay()
    const review = MOCK_IDENTITY_REVIEWS.find(r => r.id === reviewId)
    if (!review) throw new Error('심사 요청을 찾을 수 없어요')
    review.status = 'rejected'
    review.matchedBy = 'adm-001'
    review.reviewNote = input.review_note
    review.reviewedAt = new Date().toISOString().slice(0, 19)
    if (review.traineeId) {
      const trainee = findTrainee(review.traineeId)
      if (trainee) {
        trainee.reviewStatus = 'rejected'
        trainee.updatedAt = review.reviewedAt
      }
    }
    return { ...review }
  }
  const { data } = await apiClient.post<IdentityReviewDto>(
    `/identity-reviews/${reviewId}/reject`,
    input,
  )
  return mapIdentityReview(data)
}
