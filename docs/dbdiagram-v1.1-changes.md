# DBML v1.0 → v1.1 변경 사항

> 확정 논의(2026-09-09) 기준. 대상 파일: `docs/dbdiagram.io`
> 추가 확정(2026-09-09): 관리자 구글 로그인 제거 — 이메일/비밀번호 전용. `google_sub` 컬럼 삭제, `password_hash` NOT NULL
> 추가 확정(2026-09-09 2차): 감리 교육 '주제' 필드 추가 — `training_courses.topic`(과정 기본) + `training_records.topic`(이력 스냅샷, NULL=과정 상속). 생년월일 컬럼은 CI 매칭으로 불필요해 추가 안 함(수동 심사는 성명+전화 대조). 외부 수료 '시간명'은 범위 제외

---

## 1. 테이블 추가 (2)

| 테이블 | 용도 | 주요 컬럼 |
|---|---|---|
| `admin_users` | 관리자 계정 (이메일/비밀번호 로그인) | email(unique), password_hash(not null), name, role(super/staff), status(active/disabled), last_login_at |
| `admin_allowed_emails` | 관리자 화이트리스트 (초대) | email(unique), status(pending/joined), joined_admin_id, note, created_by |

## 2. 테이블 수정

| 테이블 | 삭제 | 추가 | 변경 |
|---|---|---|---|
| `users` | email, password_hash, role, status, deleted_at | ci_hash(unique·not null, 로그인 식별자), name(인증 시점 스냅샷) | note: find-or-create, 재가입=재로그인 |
| `trainees` | ci_hash | — | CI 단일 소스: users.ci_hash. 이관 시 CI 보유분은 users 행 선생성 후 user_id 연결 |
| `training_records` | external_completion_id | evidence_file_key(외부 수료 증빙) | 외부 수료 통합 — 기관·과정 등록 후 일반 이력과 동일 구조 |
| `audit_logs` | actor_user_id | actor_admin_id | FK → admin_users |

## 2-1. 테이블 삭제 (1)

| 테이블 | 사유 | 흡수 위치 |
|---|---|---|
| `external_completions` | 기관별 코스 식별로 외부 수료도 일반 이력 구조로 커버 가능 | `training_records.source='external'` + `evidence_file_key` |

## 3. FK 재지정 — `users.id` → `admin_users.id`

| 컬럼 | 소속 테이블 |
|---|---|
| `reviewed_by` | identity_reviews |
| `changed_by` | trainee_grade_histories |
| `created_by`, `updated_by` | training_records |
| `requested_by` | payment_refunds |
| `actor_admin_id` | audit_logs |

## 4. FK 유지 — `users.id`

| 컬럼 | 소속 테이블 |
|---|---|
| `user_id` | identity_verifications, identity_reviews |
| `requested_by` | certificate_requests |

## 5. 신규 FK (2)

| 관계 |
|---|
| `admin_allowed_emails.joined_admin_id` → admin_users.id |
| `admin_allowed_emails.created_by` → admin_users.id |

## 6. 주석 변경

| 대상 | 내용 |
|---|---|
| `identity_reviews` | "로그인 제한하지 않는 비동기 점검" — CI 매칭·등급 판별용 |
| `trainees.review_status` | "로그인 제어 아님" 명시 |
| `training_records` | legacy_import 일회성 이관, 미러링 없음 |
| TableGroup | `00. 관리자 및 화이트리스트` 신규 |

## 7. 로그인 플로우 확정

| 구분 | 개인회원 | 관리자 |
|---|---|---|
| 인증 | PASS 본인인증 (CI) | 이메일+비밀번호 |
| 가입 | 인증 성공 시 자동 생성 | 초대된 이메일로 최초 로그인 시 아이디(이메일)+비밀번호 회원가입. 화이트리스트 최초 1회 확인 |
| 재가입 | 같은 CI 재로그인 = 계정 복귀 | 불가 (초대 필요) |
| 접근 제어 | 게이트 없음 | admin_users.status (매 로그인) |

### 화이트리스트 운영 규칙

- `admin_allowed_emails` = **입장권** — 최초 회원가입 시에만 1회 조회
- `admin_users.status` = **계정 on/off** — 매 로그인 확인, 차단은 여기서
- 화이트리스트에서 제거해도 기존 가입자 유지 → 즉시 차단은 `status=disabled`
