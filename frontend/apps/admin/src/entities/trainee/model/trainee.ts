/** 승인 여부는 발급 게이트용 — 감리원 관리 목록에선 표기하지 않는다 (실데이터 전부 approved) */
export type TraineeReviewStatus = 'unverified' | 'pending' | 'approved' | 'rejected'

export interface Trainee {
  id: string
  traineeNo: string
  /** 감리원증번호 */
  certNo: string | null
  /** 감리원 등급 (감리원/수석감리원) — 확인서 표기용. 회원등급(결제 단가)과 별개.
   * 수동 입력이 아니라 번호 유무에서 파생된다 (seniorCertNo 있으면 수석감리원) */
  supervisorGrade: string | null
  /** 수석감리원증번호 — 승격 시 새로 부여. certNo 와 동시 보유 */
  seniorCertNo: string | null
  /** 수석감리원증 발급일 (YYYY-MM-DD) */
  seniorCertIssuedDate: string | null
  name: string
  birthDate: string | null
  phoneMasked: string
  email: string | null
  reviewStatus: TraineeReviewStatus
  membershipGradeId: string | null
  gradeName: string | null
  /** 연간 등급 만료일 (YYYY-MM-DD) — 연간 외 등급은 null */
  gradeExpiresAt: string | null
  userId: string | null
  memo: string | null
  createdAt: string
  updatedAt: string
}

export interface TraineeUpdateInput {
  name?: string
  cert_no?: string | null
  /** 빈 문자열→null 로 보내면 제거 — 수석감리원에서 감리원으로 강등 */
  senior_cert_no?: string | null
  /** 감리원 등급 선택값 — senior_cert_no 있으면 서버가 수석감리원 강제 */
  supervisor_grade?: string | null
  senior_cert_issued_date?: string | null
  birth_date?: string | null
  phone?: string
  email?: string | null
  memo?: string | null
  membership_grade_id?: string
  /** 연간 등급 만료일 — 연간 지정/연장 시 필수, 다른 등급이면 서버가 무시 */
  grade_expires_at?: string
  grade_change_reason?: string
}

export interface TraineeCreateInput {
  name: string
  cert_no?: string | null
  /** 있으면 서버가 수석감리원으로 강제 */
  senior_cert_no?: string | null
  /** 감리원 등급 선택값 — senior_cert_no 있으면 서버가 수석감리원 강제 */
  supervisor_grade?: string | null
  senior_cert_issued_date?: string | null
  birth_date?: string | null
  phone?: string
  email?: string | null
  memo?: string | null
  membership_grade_id?: string
  /** 연간 등급 지정 시 만료일 필수(서버 검증) */
  grade_expires_at?: string
}

// ── 일괄 처리 ───────────────────────────────────────────────────────────────────

export interface TraineeBulkGradeInput {
  trainee_ids: string[]
  membership_grade_id: string
  /** 연간 선택 시 만료일(전원 동일 적용) */
  grade_expires_at?: string
}

export interface TraineeBulkUpdateItem {
  id: string
  name?: string
  birth_date?: string
  /** 빈 값/생략 = 기존 번호 유지 */
  phone?: string
  /** 빈 값/생략 = 기존 번호 유지 */
  cert_no?: string
  /** 빈 값/생략 = 기존 유지. 입력 시 수석감리원으로 파생 */
  senior_cert_no?: string
}

export interface TraineeBulkUpdateInput {
  items: TraineeBulkUpdateItem[]
}

export interface TraineeBulkResult {
  /** skipped = 없는/삭제된 id, 이미 같은 등급, 변경 필드 없는 항목 */
  updated: number
  skipped: number
}

// ── 엑셀 일괄 등록 ───────────────────────────────────────────────────────────────

export interface TraineeImportRow {
  row_number: number
  name: string | null
  /** 숫자 정규화된 평문 — 프리뷰 편집용 */
  phone: string | null
  birth_date: string | null
  cert_no: string | null
  supervisor_grade: string | null
  cert_issued_date: string | null
  is_duplicate: boolean
  /** 기존 감리원 승격 — 감리원증번호는 새 번호인데 (이름, 생년)로 기존 감리원 매칭 +
   * 엑셀 등급이 수석감리원. 등록 대신 기존 감리원의 수석번호를 채운다 */
  is_promotion: boolean
  duplicate_of_name: string | null
  /** 비어 있어야 등록 가능한 행 (감리원명 누락, 날짜 파싱 실패 등) */
  errors: string[]
}

export interface TraineeImportPreviewResult {
  rows: TraineeImportRow[]
  total: number
}

export interface TraineeImportConfirmItem {
  row_number: number
  name: string
  phone?: string | null
  birth_date?: string | null
  cert_no?: string | null
  supervisor_grade?: string | null
  cert_issued_date?: string | null
}

export interface TraineeImportFailure {
  row_number: number
  error: string
}

export interface TraineeImportResult {
  /** skipped = 확정 시점 재판정에서 중복으로 걸러진 행 */
  created: number
  /** 기존 감리원의 수석번호를 채워 수석감리원으로 승격한 행 */
  promoted: number
  skipped: number
  failed: TraineeImportFailure[]
}

// ── 회원등급 마스터 ───────────────────────────────────────────────────────────

export interface MembershipGrade {
  id: string
  code: string
  name: string
  description: string | null
  sortOrder: number
  priceKrw: number
  isActive: boolean
  createdAt: string
}

export interface MembershipGradeCreateInput {
  code: string
  name: string
  description?: string
  sort_order: number
  price_krw: number
}

export interface MembershipGradeUpdateInput {
  name?: string
  description?: string
  sort_order?: number
  price_krw?: number
  is_active?: boolean
}
