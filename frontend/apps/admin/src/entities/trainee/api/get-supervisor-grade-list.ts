import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_TRAINEES } from './trainee-mock'

/** 등록된 감리원 등급 distinct — 필터 옵션. 미정(NULL)은 호출부가 '미정' 옵션으로 붙인다 */
export const getSupervisorGradeList = async (): Promise<string[]> => {
  if (USE_MOCK) {
    await mockDelay()
    return [...new Set(MOCK_TRAINEES.map(t => t.supervisorGrade).filter((g): g is string => g !== null))].sort()
  }
  const { data } = await apiClient.get<string[]>('/trainees/supervisor-grades')
  return data
}
