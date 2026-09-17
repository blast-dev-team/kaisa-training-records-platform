import { apiClient } from '@/src/shared/api'
import type { IdentityReviewDto } from './dto/identity-review-dto'
import { mapIdentityReview } from './map-identity-review'
import type { ReviewApproveInput, IdentityReview } from '../model/identity-review'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_IDENTITY_REVIEWS } from './identity-review-mock'
import { findTrainee, MOCK_TRAINEES } from '@/src/entities/trainee/api/trainee-mock'

export const postApproveIdentityReview = async (
  reviewId: string,
  input: ReviewApproveInput,
): Promise<IdentityReview> => {
  if (USE_MOCK) {
    await mockDelay()
    const review = MOCK_IDENTITY_REVIEWS.find(r => r.id === reviewId)
    if (!review) throw new Error('심사 요청을 찾을 수 없어요')
    review.status = 'approved'
    let traineeId = input.trainee_id
    if (input.new_trainee) {
      // 실API와 동일 — 모달에서 입력한 정보로 생성해 바로 연결
      const now = new Date().toISOString().slice(0, 19)
      const created = {
        id: `trn-${Date.now().toString(36)}`,
        traineeNo: `TR-${now.slice(0, 10).replaceAll('-', '')}-NEW`,
        name: input.new_trainee.name,
        birthDate: null,
        phoneMasked: '',
        email: input.new_trainee.email ?? null,
        reviewStatus: 'approved' as const,
        membershipGradeId: input.determined_grade_id ?? null,
        gradeName: null,
        userId: review.userId,
        memo: null,
        createdAt: now,
        updatedAt: now,
      }
      MOCK_TRAINEES.unshift(created)
      traineeId = created.id
    }
    review.traineeId = traineeId ?? null
    review.matchedBy = 'adm-001'
    review.determinedGradeId = input.determined_grade_id ?? null
    review.reviewedAt = new Date().toISOString().slice(0, 19)
    // 교육생 심사 상태도 함께 반영 — 실API의 승인 트리거와 동일하게
    const trainee = traineeId ? findTrainee(traineeId) : undefined
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
