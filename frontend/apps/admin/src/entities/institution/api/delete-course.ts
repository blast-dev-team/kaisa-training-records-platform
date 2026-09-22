import { apiClient } from '@/src/shared/api'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_COURSES } from './institution-mock'

/** 과정 소프트딜리트 — 이력은 과정명 스냅샷으로 표시된다 */
export const deleteCourse = async (courseId: string): Promise<void> => {
  if (USE_MOCK) {
    await mockDelay()
    const item = MOCK_COURSES.find(c => c.id === courseId)
    if (item) item.isActive = false
    return
  }
  await apiClient.delete(`/courses/${courseId}`)
}
