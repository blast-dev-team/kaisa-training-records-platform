import { apiClient } from '@/src/shared/api'
import type { CourseDto } from './dto/institution-dto'
import { mapCourse } from './map-institution'
import type { CourseInput, Course } from '../model/institution'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_COURSES, MOCK_INSTITUTIONS } from './institution-mock'

export const postCourse = async (input: CourseInput): Promise<Course> => {
  if (USE_MOCK) {
    await mockDelay()
    const institution = MOCK_INSTITUTIONS.find(i => i.id === input.institution_id)
    const created: Course = {
      id: `crs-${Date.now().toString(36)}`,
      institutionId: input.institution_id,
      sessionNameId: input.session_name_id ?? null,
      sessionName: null,
      isExternal: input.is_external ?? false,
      institutionName: institution?.name ?? null,
      name: input.name,
      courseCode: input.course_code ?? null,
      description: input.description ?? null,
      totalHours: input.total_hours,
      category: input.category ?? null,
      isActive: input.is_active ?? true,
      createdAt: new Date().toISOString().slice(0, 19),
    }
    MOCK_COURSES.push(created)
    return { ...created }
  }
  const { data } = await apiClient.post<CourseDto>('/courses', input)
  return mapCourse(data)
}
