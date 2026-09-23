import type { TrainingSource } from '../../model/training-record'

/** 목록 정렬 — period=수강기간순(기본) · registration=등록순(2026-09 이후 실등록분만) */
export type TrainingRecordSort = 'period' | 'registration'

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
  sort?: TrainingRecordSort
  page?: number
  limit?: number
}
