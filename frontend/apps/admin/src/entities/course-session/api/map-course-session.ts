import type { CourseSessionDto } from './dto/course-session-dto'
import type { CourseSession } from '../model/course-session'

export function mapCourseSession(dto: CourseSessionDto): CourseSession {
  return {
    id: dto.id,
    courseId: dto.course_id,
    courseName: dto.course_name,
    institutionId: dto.institution_id,
    institutionName: dto.institution_name,
    scheduleNo: dto.schedule_no,
    startedAt: dto.started_at,
    endedAt: dto.ended_at,
    totalHours: dto.total_hours != null ? Number(dto.total_hours) : null,
    recognizedHours: dto.recognized_hours != null ? Number(dto.recognized_hours) : null,
    isActive: dto.is_active,
    memo: dto.memo,
    enrolledCount: dto.enrolled_count,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}
