import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import type { TraineeBulkGradeInput, TraineeBulkResult } from '../model/trainee'
import { findTrainee, MOCK_GRADES } from './trainee-mock'

/** 선택 교육생 회원등급 일괄 변경 — 사유 없이 변경(이력 사유 null). 이미 같은 등급은 skipped. */
export const postTraineeBulkGrade = async (
  input: TraineeBulkGradeInput,
): Promise<TraineeBulkResult> => {
  if (USE_MOCK) {
    await mockDelay()
    let updated = 0
    let skipped = 0
    const gradeName = MOCK_GRADES.find(g => g.id === input.membership_grade_id)?.name
    for (const id of input.trainee_ids) {
      const trainee = findTrainee(id)
      if (!trainee || trainee.membershipGradeId === input.membership_grade_id) {
        skipped += 1
        continue
      }
      trainee.membershipGradeId = input.membership_grade_id
      trainee.gradeName = gradeName ?? trainee.gradeName
      trainee.updatedAt = new Date().toISOString().slice(0, 19)
      updated += 1
    }
    return { updated, skipped }
  }
  const { data } = await apiClient.post<TraineeBulkResult>('/trainees/bulk-grade', input)
  return data
}
