import { apiClient } from '@/src/shared/api'
import type { CourseDto } from './dto/institution-dto'
import { mapCourse } from './map-institution'
import type { CourseInput, Course } from '../model/institution'

export const postCourse = async (input: CourseInput): Promise<Course> => {
  const { data } = await apiClient.post<CourseDto>('/courses', input)
  return mapCourse(data)
}
