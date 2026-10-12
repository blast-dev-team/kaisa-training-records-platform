export type TrainingSource = "internal" | "external" | "legacy_import";

export const TRAINING_SOURCE_LABELS: Record<TrainingSource, string> = {
  internal: "사내",
  external: "외부",
  legacy_import: "이관",
};

export type CompletionStatus = "in_progress" | "completed" | "canceled";

export const COMPLETION_STATUS_LABELS: Record<CompletionStatus, string> = {
  in_progress: "진행중",
  completed: "수료",
  canceled: "중도취소",
};

export interface TrainingRecord {
  id: string;
  traineeId: string;
  traineeName: string | null;
  traineeNo: string | null;
  /** 감리원증번호 — trainee 조인 값, 목록 표시용 */
  traineeCertNo: string | null;
  /** trainee 조인 값 — 목록 표시용 */
  traineeBirthDate: string | null;
  traineePhone: string | null;
  courseId: string | null;
  /** 연결된 교육 일정 — 일정 연결로 생성된 이력만 보유 */
  sessionId: string | null;
  institutionId: string | null;
  /** 기관 내부/외부 구분 — institution 조인 값. internal 만 수료증 발급 가능 */
  institutionType: "internal" | "external" | null;
  courseName: string;
  institutionName: string | null;
  /** 감리원 표기 — trainee 조인 값(현재 값). record 스냅샷 컬럼은 레거시 */
  supervisorGrade: string | null;
  supervisorCertNo: string | null;
  totalHours: number | null;
  completedHours: number | null;
  startedAt: string | null;
  endedAt: string | null;
  source: TrainingSource;
  completionStatus: CompletionStatus;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingRecordInput {
  trainee_id: string;
  /** 과정·기관 마스터 연결 — 과정명·기관명·시수는 마스터에서 스냅샷 */
  course_id: string | null;
  institution_id: string | null;
  course_name?: string;
  institution_name?: string;
  /** 시수는 총 시수 하나로 관리 — 이수 시수는 서버가 total_hours 로 채운다 */
  total_hours?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  source: TrainingSource;
  completion_status: CompletionStatus;
  memo?: string | null;
}

/** 발급된 수료증 — 내부 기관 수료내역 1건당 1장 */
export interface CompletionCertificate {
  id: string;
  certificateNo: string;
  trainingRecordId: string;
  traineeId: string;
  traineeName: string | null;
  traineeBirthDate: string | null;
  courseName: string;
  /** 교육과정(회차명) — 연결 과정의 회차명, 미연결이면 null */
  sessionName: string | null;
  institutionName: string;
  completedHours: number | null;
  startedAt: string | null;
  endedAt: string | null;
  issuedAt: string;
  status: string;
}

export interface CompletionCertificateIssueInput {
  training_record_ids: string[];
}

// ── 교육내역 엑셀 일괄 등록 ─────────────────────────────────────────────────────

export interface TrainingRecordImportRow {
  row_number: number
  /** 교육생명·감리원명 */
  name: string | null
  cert_no: string | null
  institution: string | null
  subject: string | null
  start_date: string | null
  end_date: string | null
  hours_total: string | null
  hours_recog: string | null
  trainee_id: string | null
  trainee_name: string | null
  /** 마스터에 없는 기관·과정 — 확정 시 신규 생성됨 */
  institution_exists: boolean
  course_exists: boolean
  /** 비어 있어야 등록 가능한 행 (감리원 미매칭, 기관·과목 누락 등) */
  errors: string[]
}

export interface TrainingRecordImportPreviewResult {
  rows: TrainingRecordImportRow[]
  total: number
}

export interface TrainingRecordImportConfirmItem {
  row_number: number
  name: string
  cert_no: string | null
  institution: string
  subject: string
  start_date: string | null
  end_date: string | null
  hours_total: string | null
  trainee_id: string
}

export interface TrainingRecordImportFailure {
  row_number: number
  error: string
}

export interface TrainingRecordImportResult {
  /** skipped = 같은 감리원·과정·시작일의 기존 이력이 있어 건너뛴 행 */
  created: number
  skipped: number
  failed: TrainingRecordImportFailure[]
}
