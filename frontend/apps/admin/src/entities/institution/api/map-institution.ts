import type { InstitutionDto, CourseDto } from './dto/institution-dto'
import type { Institution, Course } from '../model/institution'

export function mapInstitution(dto: InstitutionDto): Institution {
  return {
    id: dto.id,
    name: dto.name,
    institutionCode: dto.institution_code,
    isActive: dto.is_active,
    createdAt: dto.created_at,
  }
}

export function mapCourse(dto: CourseDto): Course {
  return {
    id: dto.id,
    institutionId: dto.institution_id,
    institutionName: dto.institution_name,
    sessionNameId: dto.session_name_id,
    sessionName: dto.session_name,
    isExternal: dto.is_external,
    name: dto.name,
    courseCode: dto.course_code,
    description: dto.description,
    totalHours: dto.total_hours != null ? Number(dto.total_hours) : null,
    category: dto.category,
    isActive: dto.is_active,
    createdAt: dto.created_at,
  }
}
