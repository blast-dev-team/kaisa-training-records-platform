/** 엑셀 회원등급 일괄 적용 — 협회 회원명부 매칭·검증 리포트 타입.
 *
 * 백엔드 GradeImportPreviewResponse / GradeImportResult 스키마와 1:1 대응.
 */

export type GradeKind = "lifetime" | "annual";

export type GradeImportMatchMode = "cert" | "name_birth" | "name" | "none";

export type GradeImportSeverity = "block" | "warn" | "info";

/** 행 판정 태그 — 백엔드 grade_import_service.py 카테고리와 동일해야 한다 */
export type GradeImportCategory =
  | "CERT_MATCH"
  | "CERT_COLLISION"
  | "NAME_BIRTH_MATCH"
  | "BIRTH_NEAR_MATCH"
  | "NAME_TYPO_SUGGEST"
  | "AMBIGUOUS_NAME"
  | "NAME_ONLY_MATCH"
  | "NOT_FOUND"
  | "MISSING_FIELD"
  | "FILE_DUPLICATE"
  | "ALREADY_SAME_GRADE"
  | "GRADE_CONFLICT_LIFETIME"
  | "ANNUAL_UPGRADE"
  | "NO_PAYMENT_DATE"
  | "FUTURE_PAYMENT"
  | "CERT_NO_MISMATCH_INFO";

/** 카테고리 표시 라벨 + 상태 칩 톤 — 리포트 테이블에서 그대로 쓴다 */
export const GRADE_IMPORT_CATEGORY_META: Record<
  GradeImportCategory,
  { label: string; tone: "default" | "ok" | "warn" | "danger" | "info" }
> = {
  CERT_MATCH: { label: "증번호 일치", tone: "ok" },
  CERT_COLLISION: { label: "증번호 충돌", tone: "danger" },
  NAME_BIRTH_MATCH: { label: "이름·생년 일치", tone: "ok" },
  BIRTH_NEAR_MATCH: { label: "생년 오타 추정", tone: "warn" },
  NAME_TYPO_SUGGEST: { label: "이름 오타 추정", tone: "warn" },
  AMBIGUOUS_NAME: { label: "동명 여러 명", tone: "danger" },
  NAME_ONLY_MATCH: { label: "이름만 일치", tone: "warn" },
  NOT_FOUND: { label: "미등록", tone: "danger" },
  MISSING_FIELD: { label: "필수값 누락", tone: "danger" },
  FILE_DUPLICATE: { label: "중복 행", tone: "danger" },
  ALREADY_SAME_GRADE: { label: "이미 적용됨", tone: "info" },
  GRADE_CONFLICT_LIFETIME: { label: "평생→연간 불가", tone: "danger" },
  ANNUAL_UPGRADE: { label: "연간→평생 승격", tone: "info" },
  NO_PAYMENT_DATE: { label: "납부일 없음", tone: "danger" },
  FUTURE_PAYMENT: { label: "미래 납부일", tone: "warn" },
  CERT_NO_MISMATCH_INFO: { label: "증번호 상이", tone: "info" },
};

export interface GradeImportRowResult {
  row_number: number;
  name: string | null;
  birth_date: string | null;
  cert_no: string | null;
  grade_kind: GradeKind;
  grade_expires_at: string | null;
  is_highlighted: boolean;
  match_mode: GradeImportMatchMode;
  trainee_id: string | null;
  trainee_name: string | null;
  trainee_birth: string | null;
  trainee_current_grade: string | null;
  categories: GradeImportCategory[];
  severity: GradeImportSeverity;
  default_include: boolean;
  /** 이 행으로 채워질 연락처 — 교육생 빈 값일 때만 존재 */
  email: string | null;
  phone: string | null;
  contact_skip_reason: string | null;
}

export interface GradeImportSummary {
  total: number;
  lifetime: number;
  annual: number;
  included_default: number;
  excluded_default: number;
  blocked: number;
}

export interface GradeImportPreviewResult {
  sheet_kind: "separate_sheets" | "single_sheet";
  rows: GradeImportRowResult[];
  summary: GradeImportSummary;
  warnings: string[];
}

export interface GradeImportConfirmItem {
  row_number: number;
  trainee_id: string;
  grade_code: GradeKind;
  grade_expires_at: string | null;
  email: string | null;
  phone: string | null;
  include: boolean;
}

/** 행 편집 후 재매칭 요청 — 사유(CERT_COLLISION·NOT_FOUND 등)별 값을 고쳐 다시 판정.
 * 연간 만료일(grade_expires_at)은 납부일 없이 직접 지정할 수 있다 */
export interface GradeImportRematchInput {
  row_number: number;
  name: string | null;
  birth_date: string | null;
  cert_no: string | null;
  grade_kind: GradeKind;
  grade_expires_at: string | null;
  email: string | null;
  phone: string | null;
}

export interface GradeImportResult {
  grade_updated: number;
  unchanged: number;
  contact_filled: number;
  skipped: number;
  failed: { row_number: number; error: string }[];
}
