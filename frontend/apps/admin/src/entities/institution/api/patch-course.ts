import { apiClient } from '@/src/shared/api'
import type { CourseDto } from './dto/institution-dto'
import { mapCourse } from './map-institution'
import type { CourseInput, Course } from '../model/institution'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_COURSES } from './institution-mock'

export const patchCourse = async (courseId: string, input: Partial<CourseInput>): Promise<Course> => {
  if (USE_MOCK) {
    await mockDelay()
    const course = MOCK_COURSES.find(c => c.id === courseId)
    if (!course) throw new Error('과정을 찾을 수 없어요')
    if (input.name !== undefined) course.name = input.name
    if (input.course_code !== undefined) course.courseCode = input.course_code
    if (input.description !== undefined) course.description = input.description ?? null
    if (input.total_hours !== undefined) course.totalHours = input.total_hours
    if (input.category !== undefined) course.category = input.category ?? null
    if (input.is_active !== undefined) course.isActive = input.is_active
    return { ...course }
  }
  const { data } = await apiClient.patch<CourseDto>(`/courses/${courseId}`, input)
  return mapCourse(data)
}
