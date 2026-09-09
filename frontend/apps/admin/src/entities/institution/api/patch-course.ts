import { apiClient } from '@/src/shared/api'
import type { CourseDto } from './dto/institution-dto'
import { mapCourse } from './map-institution'
import type { CourseInput, Course } from '../model/institution'

export const patchCourse = async (courseId: string, input: Partial<CourseInput>): Promise<Course> => {
  const { data } = await apiClient.patch<CourseDto>(`/courses/${courseId}`, input)
  return mapCourse(data)
}
