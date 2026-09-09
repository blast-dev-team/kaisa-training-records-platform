import { apiClient } from '@/src/shared/api'
import type { IdentityReviewDto } from './dto/identity-review-dto'
import { mapIdentityReview } from './map-identity-review'
import type { ReviewApproveInput, IdentityReview } from '../model/identity-review'

export const postApproveIdentityReview = async (
  reviewId: string,
  input: ReviewApproveInput,
): Promise<IdentityReview> => {
  const { data } = await apiClient.post<IdentityReviewDto>(
    `/identity-reviews/${reviewId}/approve`,
    input,
  )
  return mapIdentityReview(data)
}
