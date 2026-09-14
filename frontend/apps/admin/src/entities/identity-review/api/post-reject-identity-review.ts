import { apiClient } from '@/src/shared/api'
import type { IdentityReviewDto } from './dto/identity-review-dto'
import { mapIdentityReview } from './map-identity-review'
import type { ReviewRejectInput, IdentityReview } from '../model/identity-review'

export const postRejectIdentityReview = async (
  reviewId: string,
  input: ReviewRejectInput,
): Promise<IdentityReview> => {
  const { data } = await apiClient.post<IdentityReviewDto>(
    `/identity-reviews/${reviewId}/reject`,
    input,
  )
  return mapIdentityReview(data)
}
