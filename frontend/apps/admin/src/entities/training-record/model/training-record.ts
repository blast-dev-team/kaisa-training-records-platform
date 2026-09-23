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
  /** 감리원증번호 — trainee 조인 값, 목록 표시용 */
  traineeCertNo: string | null
  /** trainee 조인 값 — 목록 표시용 */
  traineeBirthDate: string | null
  traineePhone: string | null
  courseId: string | null
  /** 연결된 교육 일정 — 일정 연결로 생성된 이력만 보유 */
  sessionId: string | null
  institutionId: string | null
  /** 기관 내부/외부 구분 — institution 조인 값. internal 만 수료증 발급 가능 */
  institutionType: 'internal' | 'external' | null
  courseName: string
  institutionName: string | null
  supervisorGrade: string | null
  supervisorCertNo: string | null
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
  supervisor_grade?: string | null
  supervisor_cert_no?: string | null
  total_hours?: number | null
  completed_hours?: number | null
  started_at?: string | null
  ended_at?: string | null
  source: TrainingSource
  completion_status: CompletionStatus
  memo?: string | null
}

/** 발급된 수료증 — 내부 기관 수료내역 1건당 1장 */
export interface CompletionCertificate {
  id: string
  certificateNo: string
  trainingRecordId: string
  traineeId: string
  traineeName: string | null
  traineeBirthDate: string | null
  courseName: string
  /** 교육과정(회차명) — 연결 과정의 회차명, 미연결이면 null */
  sessionName: string | null
  institutionName: string
  completedHours: number | null
  startedAt: string | null
  endedAt: string | null
  issuedAt: string
  status: string
}

export interface CompletionCertificateIssueInput {
  training_record_ids: string[]
}
