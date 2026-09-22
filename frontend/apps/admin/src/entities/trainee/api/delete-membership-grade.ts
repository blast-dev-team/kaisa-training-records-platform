import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_GRADES } from './trainee-mock'

/** 등급 소프트딜리트 — 배정된 활성 교육생이 있으면 409 */
export const deleteMembershipGrade = async (gradeId: string): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    const grade = MOCK_GRADES.find(g => g.id === gradeId)
    if (grade) grade.isActive = false
    return
  }
  await apiClient.delete(`/membership-grades/${gradeId}`)
}
