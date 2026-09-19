/**
 * 감사 로그 표시용 라벨 매핑 — 백엔드가 기록한 action / entity_type /
 * before·after 키·값을 화면용 한국어로 바꾼다. 매핑에 없는 값은 원본 그대로 노출.
 */

/** `record_audit` 액션 문자열 (백엔드 `app/core/audit.py` 호출부 기준) */
export const ACTION_LABELS: Record<string, string> = {
  'admin_user.registered': '관리자 등록',
  'admin_user.status_changed': '관리자 상태 변경',
  'admin_user.updated': '관리자 정보 수정',
  'admin_user.password_changed': '비밀번호 변경',
  'admin_user.password_reset': '비밀번호 재설정',
  'allowed_email.created': '허용 이메일 추가',
  'allowed_email.deleted': '허용 이메일 삭제',
  'certificate.revoked': '자격증 발급 취소',
  'pricing_rule.created': '발급 가격 규칙 등록',
  'pricing_rule.updated': '발급 가격 규칙 수정',
  'identity_review.approved': '본인인증 승인',
  'identity_review.rejected': '본인인증 반려',
  'institution.created': '교육기관 등록',
  'institution.updated': '교육기관 수정',
  'institution.deleted': '교육기관 삭제',
  'course.created': '교육과정 등록',
  'course.updated': '교육과정 수정',
  'course.deleted': '교육과정 삭제',
  'course_session.created': '교육 일정 등록',
  'course_session.updated': '교육 일정 수정',
  'course_session.deleted': '교육 일정 삭제',
  'session_name.created': '회차명 등록',
  'session_name.updated': '회차명 수정',
  'session_name.deleted': '회차명 삭제',
  'payment_order.refunded': '결제 환불',
  'membership_grade.deleted': '회원등급 삭제',
  'membership_grade.created': '회원등급 등록',
  'membership_grade.updated': '회원등급 수정',
  'trainee.created': '교육생 수기 등록',
  'trainee.grade_changed': '교육생 등급 변경',
  'trainee.updated': '교육생 정보 수정',
  'trainee.deleted': '교육생 삭제',
  'training_record.created': '교육 이력 등록',
  'training_record.bulk_created': '교육 이력 일괄 생성',
  'training_record.updated': '교육 이력 수정',
  'training_record.deleted': '교육 이력 삭제',
}

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  admin_user: '관리자 계정',
  admin_allowed_email: '허용 이메일',
  certificate: '자격증',
  certificate_pricing_rule: '발급 가격 규칙',
  identity_review: '본인인증 검토',
  training_institution: '훈련기관',
  training_course: '교육과정',
  payment_order: '결제 주문',
  membership_grade: '회원등급',
  trainee: '교육생',
  training_record: '교육 이력',
  course_session: '교육 일정',
  session_name: '회차명',
}

/** before / after 에 기록되는 필드 키 */
export const FIELD_LABELS: Record<string, string> = {
  status: '상태',
  email: '이메일',
  role: '권한',
  reason: '사유',
  note: '처리 메모',
  memo: '메모',
  price_krw: '발급 가격',
  is_active: '사용 여부',
  grade_id: '회원등급',
  issue_type: '발급 유형',
  trainee_id: '교육생',
  created_trainee: '신규 교육생',
  trainee_ids: '연결 교육생',
  course_id: '과정',
  started_at: '시작일',
  created: '생성 건수',
  skipped: '건너뜀',
  force_issued: '발급됨 강제 환불',
  amount_krw: '결제 금액',
  name: '이름',
  code: '등급 코드',
  institution_id: '훈련기관',
  training_record_no: '교육 이력 번호',
}

/** 필드 값 중 enum 성격인 것들 (컨텍스트 무관 공용) */
export const VALUE_LABELS: Record<string, string> = {
  pending: '대기',
  manual_review: '수동 검토',
  approved: '승인',
  rejected: '반려',
  issued: '발급',
  revoked: '취소',
  paid: '결제 완료',
  refunded: '환불',
  original: '최초 발급',
  reissue: '재발급',
  super: '최고 관리자',
  staff: '실무자',
  true: '활성',
  false: '비활성',
}

export const formatActionLabel = (action: string): string => ACTION_LABELS[action] ?? action

export const formatEntityTypeLabel = (entityType: string): string =>
  ENTITY_TYPE_LABELS[entityType] ?? entityType

export const formatFieldLabel = (key: string): string => FIELD_LABELS[key] ?? key

export const formatFieldValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString('ko-KR')
  if (typeof value === 'object') return JSON.stringify(value)
  const raw = String(value)
  if (raw === '') return '—'
  return VALUE_LABELS[raw] ?? raw
}

/**
 * 검색어를 원본 토큰으로 확장 — 한국어 라벨이 검색되려면 라벨 → 원본 값
 * (액션·엔티티 타입·필드 키·enum 값) 역매핑이 필요하다. 검색어 자체도
 * 포함하므로 관리자명·영문 원본·uuid 조각은 그대로 검색된다.
 */
export const expandSearchTokens = (q: string): string[] => {
  const term = q.trim().toLowerCase()
  if (!term) return []
  const tokens = new Set<string>([term])
  const labelMaps = [ACTION_LABELS, ENTITY_TYPE_LABELS, FIELD_LABELS, VALUE_LABELS]
  for (const map of labelMaps) {
    for (const [raw, label] of Object.entries(map)) {
      if (label.toLowerCase().includes(term)) tokens.add(raw.toLowerCase())
    }
  }
  return [...tokens]
}
