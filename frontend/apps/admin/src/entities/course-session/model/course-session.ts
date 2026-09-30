/** 일정 구분 — 감리원 연결로 생성되는 교육이력의 source (이관은 일정으로 만들지 않음) */
export type CourseSessionSource = 'internal' | 'external'

export interface CourseSession {
  id: string
  courseId: string
  courseName: string
  institutionId: string
  institutionName: string
  /** 내역 구분 — 외부 교육이면 연결된 감리원 내역도 external 로 저장 */
  source: CourseSessionSource
  /** 구 시스템 EDC_SCHDL_SN — 이관분만 보유 */
  scheduleNo: number | null
  startedAt: string | null
  endedAt: string | null
  totalHours: number | null
  recognizedHours: number | null
  isActive: boolean
  memo: string | null
  /** 이 일정에 연결된 이력(수강생) 수 */
  enrolledCount: number
  createdAt: string
  updatedAt: string
}

export interface CourseSessionInput {
  course_id: string
  started_at?: string | null
  ended_at?: string | null
  /** 시수는 총 시수 하나로 관리 — 인정 시수는 서버가 total_hours 로 채운다 */
  total_hours?: number | null
  is_active?: boolean
  source?: CourseSessionSource
  memo?: string | null
}

export interface CourseSessionUpdateInput {
  started_at?: string | null
  ended_at?: string | null
  total_hours?: number | null
  is_active?: boolean | null
  source?: CourseSessionSource | null
  memo?: string | null
}

/** 행별 수정 값 — 키가 아예 없으면 그 필드는 변경하지 않음 */
export interface CourseSessionBulkUpdateItemInput {
  id: string
  started_at?: string | null
  ended_at?: string | null
  total_hours?: number | null
  is_active?: boolean | null
  memo?: string | null
}

/** 일괄 저장 — 항목마다 다른 값을 한 요청으로 저장 */
export interface CourseSessionBulkUpdateInput {
  items: CourseSessionBulkUpdateItemInput[]
}
