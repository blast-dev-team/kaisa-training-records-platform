import type { TrainingSource } from '../../model/training-record'

export interface TrainingRecordListQuery {
  traineeId?: string
  /** 교육 일정 필터 — 일정 상세 수강생 목록 */
  sessionId?: string
  /** 특정 출처 제외 — 교육이력관리에서 외부 제외용 */
  excludeSource?: TrainingSource
  /** 교육 기간 겹침 필터 (from ~ to) */
  dateFrom?: string
  dateTo?: string
  source?: string
  completionStatus?: string
  search?: string
  page?: number
  limit?: number
}
