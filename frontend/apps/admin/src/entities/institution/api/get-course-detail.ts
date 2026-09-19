import { apiClient } from '@/src/shared/api'
import type { CourseDto } from './dto/institution-dto'
import { mapCourse } from './map-institution'
import type { Course } from '../model/institution'

export const getCourseDetail = async (courseId: string): Promise<Course> => {
  const { data } = await apiClient.get<CourseDto>(`/courses/${courseId}`)
  return mapCourse(data)
}
