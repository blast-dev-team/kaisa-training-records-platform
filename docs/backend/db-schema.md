# DB Schema — 감리원 교육이력 조회 및 확인서 발급 시스템

> 기준 문서: [dbdiagram.io](dbdiagram.io) (DBML v1.1) · PostgreSQL
> 모델 변경 시 본 파일과 DBML 을 **반드시 함께** 갱신한다.

총 21 테이블 (DBML v1.1 20개 + `user_sessions`).

공통 규칙:

- PK 는 `uuid` (클라이언트 생성 `uuid4`)
- 금액 `Integer`(원), 시간 `Numeric(8,2)`(Decimal), 날짜 `date`, 시각 `timestamptz`
- 상태값은 `varchar` + 애플리케이션 Enum (`model/enums.py`)
- 캐시 컬럼 금지 — 과거 스냅샷(당시 값 보존)만 예외 허용

---

## 0. 관리자

### admin_users — 관리자 계정

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| email | varchar(255) NOT NULL UNIQUE | 로그인 이메일. 최초 가입 시에만 화이트리스트 확인 |
| password_hash | varchar(255) NOT NULL | 이메일+비밀번호 로그인용 해시 |
| name | varchar(100) | |
| role | varchar(30) NOT NULL DEFAULT 'staff' | super / staff |
| status | varchar(30) NOT NULL DEFAULT 'active' | active / disabled — 접근 제어는 여기로 |
| last_login_at | timestamptz | |
| created_at / updated_at | timestamptz NOT NULL | |

이메일+비밀번호 전용 (구글 로그인 제거 확정).

### admin_allowed_emails — 관리자 화이트리스트

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| email | varchar(255) NOT NULL UNIQUE | |
| status | varchar(30) NOT NULL DEFAULT 'pending' | pending(미가입) / joined(가입완료) |
| joined_admin_id | uuid FK→admin_users | 가입 완료 시 연결된 계정. SET NULL |
| note | text | |
| created_by | uuid NOT NULL FK→admin_users | |
| created_at / updated_at | timestamptz NOT NULL | |

최초 가입 게이트로만 사용. 목록에서 제거해도 기존 가입자 유지 — 차단은 `admin_users.status`.

---

## 1. 회원 및 교육생

### users — 개인회원 (PASS 전용)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| ci_hash | varchar(255) NOT NULL UNIQUE | PASS 본인인증 CI 해시. 회원 로그인 식별자 |
| name | varchar(100) | 본인인증 성공 시점 이름 스냅샷 |
| last_login_at | timestamptz | |
| created_at / updated_at | timestamptz NOT NULL | |

PASS 성공 시 CI로 find-or-create. 재가입 절차 없음 — 같은 CI 재로그인 = 기존 계정 복귀.

### trainees — 교육생

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid UNIQUE FK→users SET NULL | 회원가입 전 NULL 허용 |
| trainee_no | varchar(100) UNIQUE | 협회 관리 교육생 고유번호 |
| name | varchar(100) NOT NULL | |
| phone_encrypted | text | Fernet 암호화 |
| email | varchar(255) | |
| membership_grade_id | uuid FK→membership_grades SET NULL | |
| review_status | varchar(30) NOT NULL DEFAULT 'unverified' | unverified / pending / approved / rejected (로그인 제어 아님) |
| reviewed_at | timestamptz | |
| memo | text | |
| created_at / updated_at | timestamptz NOT NULL | |

CI 는 `users.ci_hash` 단일 소스. CI 없는 이관분은 수동 매칭.

인덱스: `(name)`, `(membership_grade_id)`, `(review_status)`

### membership_grades — 회원등급 마스터

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| code | varchar(50) NOT NULL UNIQUE | |
| name | varchar(100) NOT NULL | 예: 정회원, 준회원, 비회원 |
| description | text | |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz NOT NULL | |

### trainee_grade_histories — 등급 변경 이력

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| trainee_id | uuid NOT NULL FK→trainees | |
| previous_grade_id / new_grade_id | uuid FK→membership_grades SET NULL | |
| change_reason | text | |
| changed_by | uuid FK→admin_users SET NULL | |
| changed_at | timestamptz NOT NULL | |

인덱스: `(trainee_id, changed_at)`

### user_sessions — 개인회원 세션 (DBML 부가)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid NOT NULL FK→users CASCADE | |
| token_hash | varchar(64) NOT NULL UNIQUE | opaque 토큰(256-bit)의 SHA-256 hex |
| user_agent | text | |
| created_at | timestamptz NOT NULL | |
| expires_at | timestamptz NOT NULL | 고정 TTL 24h — 슬라이딩 연장 없음 |

로그아웃 = 행 삭제. 서명키 불필요 (opaque 랜덤).

---

## 2. 본인인증 및 점검

### identity_verifications — PASS 본인인증

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid NOT NULL FK→users | |
| provider | varchar(30) NOT NULL DEFAULT 'portone' | |
| provider_verification_id | varchar(255) UNIQUE | |
| redirect_state_hash | varchar(255) | Redirect CSRF 방지용 state 해시 |
| status | varchar(30) NOT NULL DEFAULT 'pending' | pending / verified / failed / expired |
| verified_name | varchar(100) | |
| verified_phone_encrypted | text | |
| ci_hash / di_hash | varchar(255) | |
| verified_at / expires_at | timestamptz | |
| failure_code | varchar(100) / failure_message text | |
| created_at | timestamptz NOT NULL | |

인덱스: `(user_id, created_at)`, `(ci_hash)`, `(status)`

### identity_reviews — 인증 후 점검 (비동기)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| identity_verification_id | uuid NOT NULL FK→identity_verifications | |
| user_id | uuid NOT NULL FK→users | |
| trainee_id | uuid FK→trainees SET NULL | |
| status | varchar(30) NOT NULL DEFAULT 'pending' | pending / approved / rejected / manual_review |
| matched_by | varchar(30) | ci / legacy_id / manual |
| determined_grade_id | uuid FK→membership_grades SET NULL | |
| review_note | text | |
| reviewed_by | uuid FK→admin_users SET NULL | |
| reviewed_at | timestamptz | |
| created_at | timestamptz NOT NULL | |

로그인을 제한하지 않는 비동기 점검.

인덱스: `(user_id, created_at)`, `(trainee_id)`, `(status)`

---

## 3. 교육기관 및 교육과정

### training_institutions — 교육기관

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| institution_code | varchar(100) UNIQUE | |
| name | varchar(255) NOT NULL | |
| business_registration_no | varchar(50) | |
| contact_name / contact_phone / contact_email | varchar | 담당자 3종 |
| address | text | |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz NOT NULL | |

### training_courses — 교육과정 마스터

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| course_code | varchar(100) UNIQUE | |
| institution_id | uuid NOT NULL FK→training_institutions | |
| name | varchar(255) NOT NULL | |
| description | text | |
| total_hours | numeric(8,2) NOT NULL DEFAULT 0 | |
| category | varchar(100) | |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz NOT NULL | |

인덱스: `(institution_id)`, `(name)`

---

## 4. 교육이력 (외부 수료 포함)

### training_records — 교육이력

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| training_record_no | varchar(100) NOT NULL UNIQUE | 목록의 ID |
| trainee_id | uuid NOT NULL FK→trainees | |
| course_id | uuid FK→training_courses SET NULL | 레거시 이관분 NULL 가능 |
| institution_id | uuid FK→training_institutions SET NULL | |
| course_name | varchar(255) NOT NULL | 당시 교육명 스냅샷 |
| institution_name | varchar(255) NOT NULL | 당시 기관명 스냅샷 |
| total_hours | numeric(8,2) NOT NULL DEFAULT 0 | 교육 시간 |
| completed_hours | numeric(8,2) NOT NULL DEFAULT 0 | 이수 시간 |
| started_at / ended_at | date | |
| source | varchar(30) NOT NULL DEFAULT 'internal' | internal / external / legacy_import |
| evidence_file_key | text | 외부 수료 증빙 저장소 Key (source=external) |
| completion_status | varchar(30) NOT NULL DEFAULT 'completed' | in_progress / completed / canceled |
| completed_at | timestamptz | |
| memo | text | |
| created_by / updated_by | uuid FK→admin_users SET NULL | |
| created_at / updated_at | timestamptz NOT NULL | |
| deleted_at | timestamptz | soft delete |

인덱스: `(trainee_id, ended_at)`, `(course_id)`, `(institution_id)`, `(completion_status)`, `(source)`

외부 수료는 기관·과정을 등록해 일반 이력과 동일 구조로 관리 (`external_completions` 폐기).

---

## 5. 확인서 발급 가격

### certificate_pricing_rules — 등급별 발급 단가

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| membership_grade_id | uuid NOT NULL FK→membership_grades | |
| issue_type | varchar(30) NOT NULL DEFAULT 'original' | original / reissue |
| price_krw | int NOT NULL | 부가세 포함 여부는 정책 정의 |
| currency | varchar(3) NOT NULL DEFAULT 'KRW' | |
| valid_from | timestamptz NOT NULL / valid_to timestamptz | |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz NOT NULL | |

가격 변경 시 기존 규칙 보존 — 과거 결제 금액 유지.

인덱스: `(membership_grade_id, issue_type, valid_from)`

---

## 6. 확인서 발급 요청

### certificate_requests — 발급 요청

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| request_no | varchar(100) NOT NULL UNIQUE | |
| trainee_id | uuid NOT NULL FK→trainees | |
| training_record_id | uuid NOT NULL FK→training_records | |
| previous_certificate_id | uuid FK→certificates SET NULL | 재발급 시 기존 확인서 |
| requested_by | uuid NOT NULL FK→users | |
| issue_type | varchar(30) NOT NULL DEFAULT 'original' | original / reissue |
| membership_grade_id | uuid NOT NULL FK→membership_grades | 신청 당시 판별 등급 |
| pricing_rule_id | uuid FK→certificate_pricing_rules SET NULL | |
| amount_krw | int NOT NULL | 신청 당시 확정 금액 스냅샷 |
| currency | varchar(3) NOT NULL DEFAULT 'KRW' | |
| status | varchar(30) NOT NULL DEFAULT 'pending' | pending / payment_pending / paid / issuing / issued / canceled / failed |
| requested_at | timestamptz NOT NULL | |
| paid_at / issued_at / canceled_at | timestamptz | |
| failure_reason | text | |
| created_at / updated_at | timestamptz NOT NULL | |

서버에서 등급·가격 재판별 후 금액 스냅샷 저장.

인덱스: `(trainee_id, requested_at)`, `(training_record_id)`, `(status)`

---

## 7. 결제

### payment_orders — 결제 주문

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| order_no | varchar(100) NOT NULL UNIQUE | 가맹점 주문번호 |
| certificate_request_id | uuid NOT NULL UNIQUE FK→certificate_requests | 1:1 |
| trainee_id | uuid NOT NULL FK→trainees | |
| amount_krw | int NOT NULL | |
| currency | varchar(3) NOT NULL DEFAULT 'KRW' | |
| status | varchar(30) NOT NULL DEFAULT 'ready' | ready / pending / paid / failed / canceled / partial_refunded / refunded |
| paid_at | timestamptz | |
| created_at / updated_at | timestamptz NOT NULL | |

인덱스: `(trainee_id, created_at)`, `(status)`

### payment_attempts — 결제 시도

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| payment_order_id | uuid NOT NULL FK→payment_orders CASCADE | |
| attempt_no | int NOT NULL | UNIQUE(payment_order_id, attempt_no) |
| provider | varchar(30) NOT NULL DEFAULT 'portone' | |
| provider_payment_id | varchar(255) UNIQUE | 포트원 결제 식별자 |
| merchant_payment_id | varchar(255) | 가맹점 결제 식별자 |
| payment_method | varchar(50) | |
| status | varchar(30) NOT NULL DEFAULT 'ready' | ready / pending / paid / failed / canceled |
| requested_amount_krw | int NOT NULL / paid_amount_krw int DEFAULT 0 | |
| receipt_url | text | |
| failure_code / failure_message | | |
| requested_at | timestamptz NOT NULL / paid_at / failed_at | |
| raw_response | jsonb | |
| created_at / updated_at | timestamptz NOT NULL | |

실패·재시도 보존 (삭제 안 함). 인덱스: `(payment_order_id, attempt_no)` UNIQUE, `(status, created_at)`

### payment_refunds — 환불

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| payment_attempt_id | uuid NOT NULL FK→payment_attempts CASCADE | |
| provider_refund_id | varchar(255) UNIQUE | |
| amount_krw | int NOT NULL | |
| reason | text | |
| status | varchar(30) NOT NULL DEFAULT 'pending' | pending / succeeded / failed |
| requested_by | uuid FK→admin_users SET NULL | |
| requested_at | timestamptz NOT NULL / completed_at | |
| created_at | timestamptz NOT NULL | |

### payment_webhook_events — 웹훅 이벤트

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| provider | varchar(30) NOT NULL DEFAULT 'portone' | |
| provider_event_id | varchar(255) | UNIQUE(provider, provider_event_id) — 중복 방지 |
| payment_attempt_id | uuid FK→payment_attempts SET NULL | |
| event_type | varchar(100) NOT NULL | |
| payload | jsonb NOT NULL | |
| processing_status | varchar(30) NOT NULL DEFAULT 'pending' | pending / processed / failed |
| received_at | timestamptz NOT NULL / processed_at | |
| error_message | text | |

---

## 8. 발급된 확인서

### certificates — 확인서

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| certificate_no | varchar(100) NOT NULL UNIQUE | 시스템 생성 번호 |
| certificate_request_id | uuid NOT NULL UNIQUE FK→certificate_requests | 1:1 |
| trainee_id / training_record_id | uuid NOT NULL FK | |
| payment_order_id | uuid FK→payment_orders SET NULL | |
| issued_name | varchar(100) NOT NULL | 발급 당시 이름 스냅샷 |
| course_name / institution_name | varchar(255) NOT NULL | 스냅샷 |
| total_hours / completed_hours | numeric(8,2) NOT NULL | 스냅샷 |
| training_started_at / training_ended_at | date | |
| issued_at | timestamptz NOT NULL | |
| expires_at | timestamptz | 유효기간 (없으면 무기한) |
| status | varchar(30) NOT NULL DEFAULT 'issued' | issued / revoked / superseded |
| revoked_at / revoked_reason | | |
| pdf_file_key | text | 비공개 저장소 Key |
| pdf_sha256 | varchar(64) | PDF 무결성 해시 |
| created_at / updated_at | timestamptz NOT NULL | |

인덱스: `(trainee_id, issued_at)`, `(training_record_id, issued_at)`, `(certificate_no, issued_at)`

---

## 9. 진위여부 확인

### certificate_verification_logs — 진위확인 이력

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| certificate_id | uuid FK→certificates SET NULL | not_found/mismatch 는 NULL |
| input_certificate_no | varchar(100) NOT NULL | |
| input_issue_date | date NOT NULL | |
| result | varchar(30) NOT NULL | valid / expired / revoked / not_found / mismatch |
| requester_ip_hash | varchar(255) | 솔트 해시 |
| verified_at | timestamptz NOT NULL | |

인덱스: `(certificate_id, verified_at)`

---

## 10. 관리자 감사

### audit_logs — 감사 로그

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| actor_admin_id | uuid FK→admin_users SET NULL | |
| action | varchar(100) NOT NULL | create / update / delete / approve / issue / revoke … |
| entity_type | varchar(100) NOT NULL | |
| entity_id | uuid | |
| before_data / after_data | jsonb | |
| created_at | timestamptz NOT NULL | |

인덱스: `(entity_type, entity_id)`, `(actor_admin_id, created_at)`
