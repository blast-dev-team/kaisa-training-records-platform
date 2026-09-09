export type TrainingSource = 'internal' | 'external' | 'legacy_import'

export const TRAINING_SOURCE_LABELS: Record<TrainingSource, string> = {
  internal: '사내',
  external: '외부',
  legacy_import: '이관',
}

export type CompletionStatus = 'in_progress' | 'completed' | 'canceled'

export const COMPLETION_STATUS_LABELS: Record<CompletionStatus, string> = {
  in_progress: '진행중',
  completed: '수료',
  canceled: '중도취소',
}

export interface TrainingRecord {
  id: string
  traineeId: string
  traineeName: string | null
  traineeNo: string | null
  courseId: string | null
  institutionId: string | null
  courseName: string
  institutionName: string | null
  totalHours: number | null
  completedHours: number | null
  startedAt: string | null
  endedAt: string | null
  source: TrainingSource
  completionStatus: CompletionStatus
  memo: string | null
  createdAt: string
  updatedAt: string
}

export interface TrainingRecordInput {
  trainee_id: string
  /** 과정 마스터 연결 시 과정명·기관명·total_hours는 마스터에서 스냅샷 */
  course_id?: string | null
  institution_id?: string | null
  /** 미연결 시 직접 입력 (course_id·course_name 중 최소 하나 필수) */
  course_name?: string
  institution_name?: string
  total_hours?: number | null
  completed_hours?: number | null
  started_at?: string | null
  ended_at?: string | null
  source: TrainingSource
  completion_status: CompletionStatus
  memo?: string | null
}
