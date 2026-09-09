// 감리원 교육이력 조회 및 확인서 발급 시스템
// DBML Draft v1.1
// PostgreSQL 기준
// https://dbdiagram.io 에 붙여넣어 사용할 수 있습니다.
// v1.1: 개인회원 PASS 본인인증 전용화(users 축소), 관리자 분리(admin_users + 화이트리스트),
//       승인 게이트 제거(본인인증 즉시 로그인), 기존 데이터 일회성 이관 확정,
//       trainees.ci_hash → users 단일화, external_completions 제거(교육과정·이력으로 통합),
//       관리자는 이메일/비밀번호 전용 확정(구글 로그인 제거 — google_sub 컬럼 삭제)

Project training_history_system {
  database_type: 'PostgreSQL'
  Note: '교육이력, 본인인증, 회원등급, 확인서 발급 및 결제 관리'
}

// =====================================================
// 0. 관리자 (어드민 분리)
// =====================================================

Table admin_users {
  id uuid [pk]
  email varchar(255) [not null, unique, note: '로그인 이메일. 최초 가입 시에만 화이트리스트 확인']
  password_hash varchar(255) [not null, note: '이메일+비밀번호 로그인용 해시']
  name varchar(100)
  role varchar(30) [not null, default: 'staff', note: 'super / staff']
  status varchar(30) [not null, default: 'active', note: 'active / disabled']
  last_login_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Note: '관리자 계정. 이메일+비밀번호 로그인. 화이트리스트는 최초 가입 게이트로만 사용하고 이후 접근 제어는 status로 관리'
}

Table admin_allowed_emails {
  id uuid [pk]
  email varchar(255) [not null, unique]
  status varchar(30) [not null, default: 'pending', note: 'pending(미가입) / joined(가입완료)']
  joined_admin_id uuid [note: '가입 완료 시 연결된 관리자 계정']
  note text
  created_by uuid [not null]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Note: '관리자 화이트리스트(허용 이메일 초대). 최초 가입 게이트로만 사용 — 목록에서 제거해도 기존 가입자는 유지되며, 차단은 admin_users.status로 처리'
}

// =====================================================
// 1. 회원 및 교육생
// =====================================================

Table users {
  id uuid [pk]
  ci_hash varchar(255) [not null, unique, note: 'PASS 본인인증 CI 해시. 회원 로그인 식별자']
  name varchar(100) [note: '본인인증 성공 시점 이름 스냅샷']
  last_login_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Note: '개인회원 전용. PASS 본인인증 성공 시 CI로 기존 회원을 찾고 없으면 자동 생성(find-or-create). 재가입은 별도 절차 없이 같은 CI로 재로그인하면 기존 계정 그대로 복귀'
}

Table trainees {
  id uuid [pk]
  user_id uuid [unique, note: '회원가입 전에는 NULL 허용']
  trainee_no varchar(100) [unique, note: '협회에서 관리하는 교육생 고유번호']
  name varchar(100) [not null]
  phone_encrypted text
  email varchar(255)
  membership_grade_id uuid
  review_status varchar(30) [not null, default: 'unverified', note: '교육생 매칭·등급 판별 상태 (로그인 제어 아님): unverified / pending / approved / rejected']
  reviewed_at timestamptz
  memo text
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Indexes {
    (name)
    (membership_grade_id)
    (review_status)
  }

  Note: 'CI는 users.ci_hash 단일 소스. 이관 시 CI를 보유한 교육생은 users 행을 미리 생성해 user_id로 연결 — 로그인 시 users.ci_hash 조회로 매칭. CI 없는 이관분은 수동 매칭(manual_review)'
}

Table membership_grades {
  id uuid [pk]
  code varchar(50) [not null, unique]
  name varchar(100) [not null, note: '예: 정회원, 준회원, 비회원 등. 실제 등급은 협회 정책에 따름']
  description text
  sort_order int [not null, default: 0]
  is_active boolean [not null, default: true]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table trainee_grade_histories {
  id uuid [pk]
  trainee_id uuid [not null]
  previous_grade_id uuid
  new_grade_id uuid
  change_reason text
  changed_by uuid
  changed_at timestamptz [not null]

  Indexes {
    (trainee_id, changed_at)
  }
}

// =====================================================
// 2. 본인인증 및 인증 후 점검
// =====================================================

Table identity_verifications {
  id uuid [pk]
  user_id uuid [not null]
  provider varchar(30) [not null, default: 'portone']
  provider_verification_id varchar(255) [unique]
  redirect_state_hash varchar(255) [note: 'Redirect CSRF 방지용 state 해시']
  status varchar(30) [not null, default: 'pending', note: 'pending / verified / failed / expired']
  verified_name varchar(100)
  verified_phone_encrypted text
  ci_hash varchar(255)
  di_hash varchar(255)
  verified_at timestamptz
  expires_at timestamptz
  failure_code varchar(100)
  failure_message text
  created_at timestamptz [not null]

  Indexes {
    (user_id, created_at)
    (ci_hash)
    (status)
  }

  Note: 'Redirect 이후 서버에서 포트원 인증 결과를 검증한 뒤 성공 처리'
}

Table identity_reviews {
  id uuid [pk]
  identity_verification_id uuid [not null]
  user_id uuid [not null]
  trainee_id uuid
  status varchar(30) [not null, default: 'pending', note: 'pending / approved / rejected / manual_review']
  matched_by varchar(30) [note: 'ci / legacy_id / manual']
  determined_grade_id uuid
  review_note text
  reviewed_by uuid
  reviewed_at timestamptz
  created_at timestamptz [not null]

  Indexes {
    (user_id, created_at)
    (trainee_id)
    (status)
  }

  Note: '본인인증 이후 기존 교육생 매칭, 중복 확인, 회원등급 판별. 로그인을 제한하지 않는 비동기 점검'
}

// =====================================================
// 3. 교육기관 및 교육과정
// =====================================================

Table training_institutions {
  id uuid [pk]
  institution_code varchar(100) [unique]
  name varchar(255) [not null]
  business_registration_no varchar(50)
  contact_name varchar(100)
  contact_phone varchar(50)
  contact_email varchar(255)
  address text
  is_active boolean [not null, default: true]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table training_courses {
  id uuid [pk]
  course_code varchar(100) [unique]
  institution_id uuid [not null]
  name varchar(255) [not null]
  description text
  total_hours numeric(8,2) [not null, default: 0]
  category varchar(100)
  topic varchar(255) [note: '과정 기본 주제']
  is_active boolean [not null, default: true]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Indexes {
    (institution_id)
    (name)
  }

  Note: '교육과정 마스터. 동일 과정에 여러 교육생의 이력이 연결될 수 있음'
}

// =====================================================
// 4. 교육이력 (외부 수료 포함)
// =====================================================

Table training_records {
  id uuid [pk]
  training_record_no varchar(100) [not null, unique, note: '협회가 등록하는 교육이력 고유 ID']
  trainee_id uuid [not null]
  course_id uuid [note: '레거시 이관분은 NULL 가능. 외부 수료는 해당 기관·과정을 등록해 연결']
  institution_id uuid

  course_name varchar(255) [not null, note: '당시 교육명 스냅샷']
  institution_name varchar(255) [not null, note: '당시 교육기관명 스냅샷']
  topic varchar(255) [note: '당시 주제 스냅샷. NULL이면 과정(training_courses.topic) 상속']
  total_hours numeric(8,2) [not null, default: 0, note: '교육 시간']
  completed_hours numeric(8,2) [not null, default: 0, note: '교육 이수 시간']
  started_at date
  ended_at date

  source varchar(30) [not null, default: 'internal', note: 'internal / external / legacy_import (일회성 이관)']
  evidence_file_key text [note: '외부 수료 증빙파일의 비공개 저장소 Key. source=external인 경우 사용']
  completion_status varchar(30) [not null, default: 'completed', note: 'in_progress / completed / canceled']
  completed_at timestamptz
  memo text
  created_by uuid
  updated_by uuid
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  deleted_at timestamptz

  Indexes {
    (trainee_id, ended_at)
    (course_id)
    (institution_id)
    (completion_status)
    (source)
  }

  Note: '교육생별 실제 교육이력. 외부 수료는 기관(institution)·과정(course)을 등록해 일반 이력과 동일 구조로 관리. 목록의 ID는 training_record_no 사용. 기존 데이터는 일회성 이관(미러링 없음)'
}

// =====================================================
// 5. 회원등급별 확인서 발급 가격
// =====================================================

Table certificate_pricing_rules {
  id uuid [pk]
  membership_grade_id uuid [not null]
  issue_type varchar(30) [not null, default: 'original', note: 'original / reissue']
  price_krw int [not null, note: '부가세 포함 여부 등은 정책으로 정의']
  currency varchar(3) [not null, default: 'KRW']
  valid_from timestamptz [not null]
  valid_to timestamptz
  is_active boolean [not null, default: true]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Indexes {
    (membership_grade_id, issue_type, valid_from)
  }

  Note: '등급별 발급 단가. 가격 변경 시 기존 규칙을 보존하여 과거 결제 금액 유지'
}

// =====================================================
// 6. 확인서 발급 요청
// =====================================================

Table certificate_requests {
  id uuid [pk]
  request_no varchar(100) [not null, unique]
  trainee_id uuid [not null]
  training_record_id uuid [not null]
  previous_certificate_id uuid [note: '재발급 시 기존 확인서 연결']
  requested_by uuid [not null]

  issue_type varchar(30) [not null, default: 'original', note: 'original / reissue']
  membership_grade_id uuid [not null, note: '신청 당시 판별된 회원등급']
  pricing_rule_id uuid
  amount_krw int [not null, note: '신청 당시 확정된 결제 금액']
  currency varchar(3) [not null, default: 'KRW']

  status varchar(30) [not null, default: 'pending', note: 'pending / payment_pending / paid / issuing / issued / canceled / failed']
  requested_at timestamptz [not null]
  paid_at timestamptz
  issued_at timestamptz
  canceled_at timestamptz
  failure_reason text
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Indexes {
    (trainee_id, requested_at)
    (training_record_id)
    (status)
  }

  Note: '발급 버튼 및 모달에서 생성. 서버에서 등급과 가격을 재판별하고 금액 스냅샷을 저장'
}

// =====================================================
// 7. 결제 주문 및 결제 시도
// =====================================================

Table payment_orders {
  id uuid [pk]
  order_no varchar(100) [not null, unique, note: '가맹점 주문번호']
  certificate_request_id uuid [not null, unique]
  trainee_id uuid [not null]
  amount_krw int [not null]
  currency varchar(3) [not null, default: 'KRW']
  status varchar(30) [not null, default: 'ready', note: 'ready / pending / paid / failed / canceled / partial_refunded / refunded']
  paid_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Indexes {
    (trainee_id, created_at)
    (status)
  }
}

Table payment_attempts {
  id uuid [pk]
  payment_order_id uuid [not null]
  attempt_no int [not null]
  provider varchar(30) [not null, default: 'portone']
  provider_payment_id varchar(255) [unique, note: '포트원 결제 식별자']
  merchant_payment_id varchar(255) [note: '사용 API 버전의 가맹점 결제 식별자']
  payment_method varchar(50)
  status varchar(30) [not null, default: 'ready', note: 'ready / pending / paid / failed / canceled']
  requested_amount_krw int [not null]
  paid_amount_krw int [not null, default: 0]
  receipt_url text
  failure_code varchar(100)
  failure_message text
  requested_at timestamptz [not null]
  paid_at timestamptz
  failed_at timestamptz
  raw_response jsonb
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Indexes {
    (payment_order_id, attempt_no) [unique]
    (status, created_at)
  }

  Note: '실패 및 재시도 내역을 삭제하지 않고 각각 보존. 포트원 서버 검증 후 상태 확정'
}

Table payment_refunds {
  id uuid [pk]
  payment_attempt_id uuid [not null]
  provider_refund_id varchar(255) [unique]
  amount_krw int [not null]
  reason text
  status varchar(30) [not null, default: 'pending', note: 'pending / succeeded / failed']
  requested_by uuid
  requested_at timestamptz [not null]
  completed_at timestamptz
  created_at timestamptz [not null]
}

Table payment_webhook_events {
  id uuid [pk]
  provider varchar(30) [not null, default: 'portone']
  provider_event_id varchar(255)
  payment_attempt_id uuid
  event_type varchar(100) [not null]
  payload jsonb [not null]
  processing_status varchar(30) [not null, default: 'pending', note: 'pending / processed / failed']
  received_at timestamptz [not null]
  processed_at timestamptz
  error_message text

  Indexes {
    (provider, provider_event_id) [unique]
    (payment_attempt_id)
  }

  Note: '웹훅 중복 처리 방지 및 결제 상태 추적'
}

// =====================================================
// 8. 발급된 확인서
// =====================================================

Table certificates {
  id uuid [pk]
  certificate_no varchar(100) [not null, unique, note: '시스템에서 생성하는 확인서 번호']
  certificate_request_id uuid [not null, unique]
  trainee_id uuid [not null]
  training_record_id uuid [not null]
  payment_order_id uuid

  issued_name varchar(100) [not null, note: '발급 당시 교육생 이름']
  course_name varchar(255) [not null]
  institution_name varchar(255) [not null]
  total_hours numeric(8,2) [not null]
  completed_hours numeric(8,2) [not null]
  training_started_at date
  training_ended_at date

  issued_at timestamptz [not null]
  expires_at timestamptz
  status varchar(30) [not null, default: 'issued', note: 'issued / revoked / superseded']
  revoked_at timestamptz
  revoked_reason text

  pdf_file_key text [note: '발급된 PDF의 비공개 저장소 Key']
  pdf_sha256 varchar(64) [note: 'PDF 파일 무결성 확인용 해시']
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  Indexes {
    (trainee_id, issued_at)
    (training_record_id, issued_at)
    (certificate_no, issued_at)
  }

  Note: '발급 당시 교육정보를 스냅샷으로 보존. 유효기간 만료 여부는 expires_at과 현재시각으로 판단'
}

// =====================================================
// 9. 진위여부 확인
// =====================================================

Table certificate_verification_logs {
  id uuid [pk]
  certificate_id uuid
  input_certificate_no varchar(100) [not null]
  input_issue_date date [not null]
  result varchar(30) [not null, note: 'valid / expired / revoked / not_found / mismatch']
  requester_ip_hash varchar(255)
  verified_at timestamptz [not null]

  Indexes {
    (certificate_id, verified_at)
  }

  Note: '확인서 번호 + 발급날짜로 조회한 이력. 공개 화면에서는 개인정보 노출 최소화'
}

// =====================================================
// 10. 관리자 감사 로그
// =====================================================

Table audit_logs {
  id uuid [pk]
  actor_admin_id uuid
  action varchar(100) [not null, note: 'create / update / delete / approve / issue / revoke 등']
  entity_type varchar(100) [not null]
  entity_id uuid
  before_data jsonb
  after_data jsonb
  created_at timestamptz [not null]

  Indexes {
    (entity_type, entity_id)
    (actor_admin_id, created_at)
  }

  Note: '교육이력 수정, 외부 수료 승인, 등급 변경, 확인서 취소 등 관리자 변경 이력'
}

// =====================================================
// Relationships
// =====================================================

// 관리자 / 화이트리스트
Ref: admin_allowed_emails.joined_admin_id > admin_users.id
Ref: admin_allowed_emails.created_by > admin_users.id

// 회원 / 교육생
Ref: trainees.user_id > users.id
Ref: trainees.membership_grade_id > membership_grades.id
Ref: trainee_grade_histories.trainee_id > trainees.id
Ref: trainee_grade_histories.previous_grade_id > membership_grades.id
Ref: trainee_grade_histories.new_grade_id > membership_grades.id
Ref: trainee_grade_histories.changed_by > admin_users.id

// 본인인증
Ref: identity_verifications.user_id > users.id
Ref: identity_reviews.identity_verification_id > identity_verifications.id
Ref: identity_reviews.user_id > users.id
Ref: identity_reviews.trainee_id > trainees.id
Ref: identity_reviews.determined_grade_id > membership_grades.id
Ref: identity_reviews.reviewed_by > admin_users.id

// 교육
Ref: training_courses.institution_id > training_institutions.id

Ref: training_records.trainee_id > trainees.id
Ref: training_records.course_id > training_courses.id
Ref: training_records.institution_id > training_institutions.id
Ref: training_records.created_by > admin_users.id
Ref: training_records.updated_by > admin_users.id

// 가격 / 발급 요청
Ref: certificate_pricing_rules.membership_grade_id > membership_grades.id
Ref: certificate_requests.trainee_id > trainees.id
Ref: certificate_requests.training_record_id > training_records.id
Ref: certificate_requests.previous_certificate_id > certificates.id
Ref: certificate_requests.requested_by > users.id
Ref: certificate_requests.membership_grade_id > membership_grades.id
Ref: certificate_requests.pricing_rule_id > certificate_pricing_rules.id

// 결제
Ref: payment_orders.certificate_request_id > certificate_requests.id
Ref: payment_orders.trainee_id > trainees.id
Ref: payment_attempts.payment_order_id > payment_orders.id
Ref: payment_refunds.payment_attempt_id > payment_attempts.id
Ref: payment_refunds.requested_by > admin_users.id
Ref: payment_webhook_events.payment_attempt_id > payment_attempts.id

// 확인서
Ref: certificates.certificate_request_id > certificate_requests.id
Ref: certificates.trainee_id > trainees.id
Ref: certificates.training_record_id > training_records.id
Ref: certificates.payment_order_id > payment_orders.id
Ref: certificate_verification_logs.certificate_id > certificates.id

// 감사
Ref: audit_logs.actor_admin_id > admin_users.id

// =====================================================
// Table Groups
// =====================================================

TableGroup "00. 관리자 및 화이트리스트" {
  admin_users
  admin_allowed_emails
}

TableGroup "01. 회원 및 교육생" {
  users
  trainees
  membership_grades
  trainee_grade_histories
}

TableGroup "02. 본인인증 및 점검" {
  identity_verifications
  identity_reviews
}

TableGroup "03. 교육 마스터" {
  training_institutions
  training_courses
}

TableGroup "04. 교육이력" {
  training_records
}

TableGroup "05. 확인서 발급" {
  certificate_pricing_rules
  certificate_requests
  certificates
}

TableGroup "06. 결제 및 환불" {
  payment_orders
  payment_attempts
  payment_refunds
  payment_webhook_events
}

TableGroup "07. 진위여부 확인" {
  certificate_verification_logs
}

TableGroup "08. 관리자 감사" {
  audit_logs
}
