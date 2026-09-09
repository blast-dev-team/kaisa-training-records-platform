# Admin 앱 API 가이드 — 관리자 콘솔

> 대상: `frontend/apps/admin` (Vite + React SPA, FSD)
> 기준: `backend/api` 라우터 실제 구현 (2026-09-09) · 화면 설계는 [frontend-plan.md](frontend-plan.md)
> 이 문서만 보고 entities API 계층을 작성할 수 있게 정리했다.

---

## 1. 공통 사항

### 베이스 URL · 인증

- 모든 경로 앞 `/api` prefix.
- 인증은 **쿠키 세션** — `kaisa_session` (httponly, samesite=lax). axios 인스턴스에 `withCredentials: true`.
- 권한 2단계:
  - `require_admin` — 관리자 세션 (role: `super` | `staff` 모두 통과)
  - `require_super` — 슈퍼 관리자만 (관리자 계정 관리)
- 미로그인 `401 UNAUTHORIZED|SESSION_EXPIRED` → `/login` 리다이렉트.
- 계정 비활성 `403 ACCOUNT_DISABLED` → 안내 문구 후 로그아웃.

### 에러 형태

```json
{ "code": "INVALID_CREDENTIALS", "message": "이메일 또는 비밀번호가 일치하지 않아요" }
```

어드민에서 자주 만나는 코드:

| code | HTTP | 상황 |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | 로그인 실패 (5회 연속 실패 시 잠금 → `TOO_MANY_ATTEMPTS` 429) |
| `EMAIL_NOT_ALLOWED` | 403 | 화이트리스트에 없는 이메일 가입 시도 |
| `WEAK_PASSWORD` | 400 | 비밀번호 10자 미만·영숫자 아님 |
| `DUPLICATE_EMAIL` | 409 | 이미 가입된 이메일 |
| `FORBIDDEN` | 403 | staff 의 super 전용 기능 접근 |
| `GRADE_NOT_DETERMINED` | 409 | 심사 승인 시 등급 미지정 |
| `TRAINEE_ALREADY_LINKED` | 409 | 심사 승인 시 이미 연결된 교육생 |
| `INVALID_STATUS_TRANSITION` | 400 | 이미 처리된 심사·주문 재처리 |

전체 코드표: `backend/api/app/core/error_codes.py`.

### 페이지네이션 (PagedResponse)

목록형 GET 은 전부 서버 페이지네이션 (기본 `page=1`, `limit=20`, max 100):

```json
{ "items": [ ... ], "total": 87, "page": 1, "limit": 20, "total_pages": 5 }
```

마스터성 목록(기관·과정·등급·관리자·화이트리스트)은 페이지네이션 없는 단순 배열.

### 날짜·시간

- `datetime` 필드는 UTC 오프셋 ISO — 화면 표기 시 `toYMD` util 사용 (`slice(0,10)` 금지).
- 날짜 필드는 `YYYY-MM-DD`.

---

## 2. 주요 플로우

### 2.1 최초 가입 · 로그인

```
POST /api/admin-allowed-emails   (super 또는 기존 admin)  ← 화이트리스트 등록 (초대)
POST /api/auth/register { email, password }                ← 화이트리스트 pending 이메일만 가입 가능
POST /api/auth/login { email, password }                   → 세션 쿠키
GET  /api/auth/me                                          → { account_type, id, email, name, role }
```

- 첫 계정은 시드/마이그레이션으로 생성된 super 로 시작.
- 회원가입 조건: 화이트리스트(`admin_allowed_emails`) `pending` 상태 이메일 + 비밀번호 10자 이상 영문+숫자.
- 계정 차단은 `PATCH /api/admin-users/{id}` 로 `status: "disabled"` — 삭제 아님.

### 2.2 교육생 등급 변경

```
PATCH /api/trainees/{trainee_id} { membership_grade_id, grade_change_reason }
```

- `grade_change_reason` 는 등급 변경 시 필수는 아니지만 history(`trainee_grade_histories`)·감사로그 기록에 쓰인다 — 모달에서 사유 입력 받아 전송.
- `review_status` 는 이 API로 변경하지 않는다 (본인인증 심사 도메인 전용).

### 2.3 본인인증 수동 심사

```
GET  /api/trainees?search=홍길동            ← 매칭 후보 검색 (전화는 마스킹로 대조)
GET  /api/identity-reviews?status=manual_review
POST /api/identity-reviews/{review_id}/approve { trainee_id, determined_grade_id }
POST /api/identity-reviews/{review_id}/reject  { review_note }
```

- 승인: 화면에서 검색한 교육생 `trainee_id` 를 연결. `determined_grade_id` 생략 시 서버가 기본 등급 조회 → 없으면 `GRADE_NOT_DETERMINED` 409.
- 전화번호는 암호화 저장이라 검색 불가 — 성명 검색 + `phone_masked` 눈 대조 (설계 확정, frontend-plan §3).

### 2.4 확인서 철회 · 결제 환불

```
POST /api/certificates/{certificate_id}/revoke { reason }   → status: "revoked"
POST /api/payment-orders/{order_id}/refunds  { reason }     → status: "refunded"
```

둘 다 사유 필수. 감사로그(`certificate.revoked`, `payment_order.refunded`) 자동 기록.

### 2.5 가격 규칙 (등급 × 발급유형 단가)

```
GET   /api/certificate-pricing-rules?is_active=true
POST  /api/certificate-pricing-rules { membership_grade_id, issue_type, price_krw, valid_from }
PATCH /api/certificate-pricing-rules/{rule_id} { price_krw | valid_to | is_active }
```

- `issue_type`: `original` | `reissue`. 0원이면 회원 신청 시 즉시 발급.
- 회원 가격은 `valid_from ~ valid_to` 기간 내 활성 규칙 1건으로 결정 — 기간 겹치지 않게 관리.

---

## 3. 엔드포인트 전체 목록

### 인증 (auth)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/auth/register` | 없음 (화이트리스트 검증) | 최초 가입 (201) |
| POST | `/api/auth/login` | 없음 | 로그인 → 세션 쿠키 |
| POST | `/api/auth/logout` | 없음 | `{ok: true}` |
| GET | `/api/auth/me` | 세션 | 현재 계정 |

### 관리자 계정 (super)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/admin-users` | 계정 목록 (배열) |
| PATCH | `/api/admin-users/{admin_id}` | `{status: "active"\|"disabled"}` |

### 화이트리스트 (admin)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/admin-allowed-emails` | 초대 이메일 목록 (배열) |
| POST | `/api/admin-allowed-emails` | `{email, note}` 등록 (201) |
| DELETE | `/api/admin-allowed-emails/{allowed_email_id}` | 삭제 (204) |

### 교육생 (admin)

| Method | Path | Query / Body | 설명 |
|---|---|---|---|
| GET | `/api/trainees` | `search`,`review_status`,`grade_id`,`page`,`limit` | 목록 (Paged) |
| GET | `/api/trainees/{trainee_id}` | | 단건 |
| PATCH | `/api/trainees/{trainee_id}` | `{name?, phone?, email?, memo?, membership_grade_id?, grade_change_reason?}` | 수정·등급 변경 |

### 회원등급 마스터 (admin)

| Method | Path | Body | 설명 |
|---|---|---|---|
| GET | `/api/membership-grades` | `is_active` | 목록 (배열) |
| POST | `/api/membership-grades` | `{code, name, description?, sort_order}` | 등록 (201) |
| PATCH | `/api/membership-grades/{grade_id}` | `{name?, description?, sort_order?, is_active?}` | 수정 |

### 교육이력 (admin)

| Method | Path | Query / Body | 설명 |
|---|---|---|---|
| GET | `/api/training-records` | `trainee_id`,`source`,`completion_status`,`page`,`limit` | 목록 (Paged) |
| GET | `/api/training-records/{record_id}` | | 단건 |
| POST | `/api/training-records` | 아래 Create | 등록 (201) — internal/external 동일 경로 |
| PATCH | `/api/training-records/{record_id}` | 아래 Update | 수정 |
| DELETE | `/api/training-records/{record_id}` | | 소프트딜리트 (204) |

`TrainingRecordCreate`:

```json
{
  "trainee_id": "<uuid>",
  "course_id": null,
  "institution_id": null,
  "course_name": "2026 소방안전관리자 과정",
  "institution_name": "한국소방안전원",
  "total_hours": 8,
  "completed_hours": 8,
  "started_at": "2026-08-01",
  "ended_at": "2026-08-31",
  "source": "internal | external | legacy_import",
  "evidence_file_key": null,
  "completion_status": "in_progress | completed | canceled",
  "memo": null
}
```

- `course_id` 연결 시 과정명·기관명·`total_hours`는 마스터에서 스냅샷. 미연결 시 `course_name`/`institution_name` 직접 입력 (최소 하나는 필수).
- 외부 수료 등록 = `source: "external"` + 동일 폼.

### 기관·과정 마스터 (admin)

| Method | Path | Query / Body | 설명 |
|---|---|---|---|
| GET | `/api/institutions` | `is_active`,`search` | 기관 목록 (배열) |
| GET/POST/PATCH | `/api/institutions[/{id}]` | `{name, institution_code?, ...}` | 조회/등록(201)/수정 |
| GET | `/api/courses` | `institution_id`,`is_active` | 과정 목록 (배열) |
| GET/POST/PATCH | `/api/courses[/{id}]` | `{institution_id, name, course_code?, description?, total_hours, category?}` | 조회/등록(201)/수정 |

삭제 엔드포인트 없음 — 비활성은 `is_active: false`.

### 본인인증 심사 (admin)

| Method | Path | Body | 설명 |
|---|---|---|---|
| GET | `/api/identity-reviews` | `status`,`page`,`limit` | 목록 (Paged) |
| POST | `/api/identity-reviews/{review_id}/approve` | `{trainee_id, determined_grade_id?}` | 승인 |
| POST | `/api/identity-reviews/{review_id}/reject` | `{review_note}` | 거절 |

### 확인서 (admin)

| Method | Path | Query / Body | 설명 |
|---|---|---|---|
| GET | `/api/certificates` | `trainee_id`,`status`,`page`,`limit` | 발급 내역 (Paged) |
| POST | `/api/certificates/{certificate_id}/revoke` | `{reason}` | 철회 |

### 가격 규칙 (admin)

| Method | Path | Body | 설명 |
|---|---|---|---|
| GET | `/api/certificate-pricing-rules` | `membership_grade_id`,`issue_type`,`is_active`,`page`,`limit` | 목록 (Paged) |
| POST | `/api/certificate-pricing-rules` | `{membership_grade_id, issue_type, price_krw, currency?, valid_from, valid_to?, is_active?}` | 등록 (201) |
| PATCH | `/api/certificate-pricing-rules/{rule_id}` | `{price_krw?, valid_to?, is_active?}` | 수정 |

### 결제 주문 (admin)

| Method | Path | Body | 설명 |
|---|---|---|---|
| GET | `/api/payment-orders` | `trainee_id`,`status`,`page`,`limit` | 목록 (Paged) |
| POST | `/api/payment-orders/{order_id}/refunds` | `{reason}` | 환불 |

### 감사 로그 (admin)

| Method | Path | Query | 설명 |
|---|---|---|---|
| GET | `/api/audit-logs` | `entity_type`,`entity_id`,`actor_admin_id`,`page`,`limit` | 목록 (Paged) |

### 공통

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스체크 |

---

## 4. 상태값 사전 (enums)

| 도메인 | 필드 | 값 |
|---|---|---|
| 관리자 | `role` | `super` \| `staff` |
| 관리자 | `status` | `active` \| `disabled` |
| 화이트리스트 | `status` | `pending` \| `joined` |
| 교육생 | `review_status` | `unverified` \| `pending` \| `approved` \| `rejected` |
| 심사 | `status` | `pending` \| `approved` \| `rejected` \| `manual_review` |
| 이력 | `source` | `internal` \| `external` \| `legacy_import` |
| 이력 | `completion_status` | `in_progress` \| `completed` \| `canceled` |
| 발급신청 | `status` | `pending` \| `payment_pending` \| `paid` \| `issuing` \| `issued` \| `canceled` \| `failed` |
| 확인서 | `status` | `issued` \| `revoked` \| `superseded` |
| 결제주문 | `status` | `ready` \| `pending` \| `paid` \| `failed` \| `canceled` \| `partial_refunded` \| `refunded` |
| 발급유형 | `issue_type` | `original` \| `reissue` |

### 주요 응답 스키마 (DTO 원형)

`AdminUserResponse`:

```json
{ "id": "...", "email": "admin@kaisa.or.kr", "name": "관리자", "role": "super", "status": "active", "last_login_at": null, "created_at": "..." }
```

`TraineeResponse`:

```json
{ "id": "...", "trainee_no": "T-2026-0001", "name": "홍길동", "phone_masked": "010-****-5678", "email": null, "review_status": "approved", "membership_grade_id": "...", "grade_name": "일반", "user_id": null, "memo": null, "created_at": "...", "updated_at": "..." }
```

`IdentityReviewResponse`:

```json
{ "id": "...", "identity_verification_id": "...", "user_id": "...", "user_name": "홍길동", "trainee_id": null, "verified_name": "홍길동", "verified_phone_masked": "010-****-5678", "status": "manual_review", "matched_by": null, "determined_grade_id": null, "review_note": null, "reviewed_at": null, "created_at": "..." }
```

`CertificateResponse` (발급 내역):

```json
{ "id": "...", "certificate_no": "CT-...", "certificate_request_id": "...", "trainee_id": "...", "training_record_id": "...", "payment_order_id": "...", "issued_name": "홍길동", "course_name": "...", "institution_name": "...", "total_hours": 8, "completed_hours": 8, "training_started_at": "2026-08-01", "training_ended_at": "2026-08-31", "issued_at": "...", "expires_at": null, "status": "issued", "revoked_at": null, "revoked_reason": null }
```

`PaymentOrderResponse`:

```json
{ "id": "...", "order_no": "PO-...", "certificate_request_id": "...", "trainee_id": "...", "amount_krw": 1800, "currency": "KRW", "status": "paid", "paid_at": "...", "created_at": "..." }
```

`AuditLogResponse`:

```json
{ "id": "...", "actor_admin_id": "...", "actor_name": "관리자", "action": "trainee.grade_changed", "entity_type": "trainee", "entity_id": "...", "before": { "grade_id": "..." }, "after": { "grade_id": "..." }, "created_at": "..." }
```

`PricingRuleResponse`:

```json
{ "id": "...", "membership_grade_id": "...", "issue_type": "original", "price_krw": 1800, "currency": "KRW", "valid_from": "...", "valid_to": null, "is_active": true, "created_at": "..." }
```

---

## 5. entities API 작성 가이드 (FSD)

구조·룰은 `.claude/rules/front/entities-layer.md`, `shared-layer.md` 참고. 요약:

```
src/entities/<도메인>/
├── api/
│   ├── dto/<도메인>-dto.ts          # 위 §3·§4 스키마를 snake_case 그대로 타입화
│   ├── mapper/map-<도메인>.ts       # dto → model (camelCase) 변환
│   ├── query/<도메인>-list-query.ts # GET 쿼리 파라미터 타입
│   ├── get-<도메인>-list.ts / get-<도메인>-detail.ts
│   ├── post-<도메인>.ts / patch-<도메인>.ts
│   └── <도메인>-queries.ts          # queryOptions
├── model/<도메인>.ts
└── index.ts
```

규칙:

- 호출은 `shared/api/instance.ts` axios 인스턴스로만 (`baseURL: "/api"`, `withCredentials: true`, 401 → 로그인 리다이렉트 interceptor).
- 뷰에서 직접 API 호출 금지 — `queryOptions` + `useQuery`/`useMutation`.
- 목록은 서버 페이지네이션 20 고정 (`front/pagination.md`), 필터·페이지는 URL 쿼리스트링으로 (`front/url-state.md` — `page`,`q`,`status`,`from`,`to` 표준 키 → API 파라미터로 mapper에서 변환).

### 도메인 분할 (frontend-plan §5 와 1:1)

| entities 폴더 | 담당 엔드포인트 |
|---|---|
| `entities/auth` | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me` |
| `entities/admin-user` | `/admin-users`, `/admin-allowed-emails` (계정·화이트리스트) |
| `entities/trainee` | `/trainees`, `/membership-grades` |
| `entities/training-record` | `/training-records` |
| `entities/institution` | `/institutions`, `/courses` |
| `entities/identity-review` | `/identity-reviews` (심사·승인·거절) |
| `entities/certificate` | `/certificates` (내역·철회), `/certificate-pricing-rules` |
| `entities/payment` | `/payment-orders` (목록·환불) |
| `entities/audit` | `/audit-logs` |

### 샘플 — `entities/trainee/api/get-trainee-list.ts`

```ts
import { apiClient } from "@/src/shared/api";
import type { PagedResponse } from "@/src/shared/api/types";
import type { TraineeDto } from "../dto/trainee-dto";
import type { TraineeListQuery } from "../query/trainee-list-query";
import { mapTrainee } from "../mapper/map-trainee";
import type { Trainee } from "../../model/trainee";

export const getTraineeList = async (
  query: TraineeListQuery,
): Promise<{ items: Trainee[]; total: number; page: number; limit: number; total_pages: number }> => {
  const { data } = await apiClient.get<PagedResponse<TraineeDto>>("/trainees", {
    params: {
      search: query.q || undefined,
      review_status: query.reviewStatus || undefined,
      grade_id: query.gradeId || undefined,
      page: query.page,
      limit: 20,
    },
  });
  return { ...data, items: data.items.map(mapTrainee) };
};
```

```ts
// entities/trainee/api/trainee-queries.ts
import { queryOptions } from "@tanstack/react-query";
import { getTraineeList } from "./get-trainee-list";

export const traineeQueries = {
  all: () => ["trainees"] as const,
  lists: () => [...traineeQueries.all(), "list"] as const,
  list: (query: TraineeListQuery) =>
    queryOptions({
      queryKey: [...traineeQueries.lists(), query],
      queryFn: () => getTraineeList(query),
    }),
};
```

주의:

- URL 표준 키(`q`)와 API 파라미터(`search`)는 **query 함수 안에서만 변환** — URL·쿼리키는 표준 키를 쓴다.
- 상태값은 §4 사전의 문자열 리터럴 union으로 model에 정의.
- `phone_masked`, `verified_phone_masked` 는 서버가 마스킹한 값 — FE 추가 가공·원본 요청 금지.
- 등급 변경·철회·환불 mutation 은 사유 필드를 폼에서 필수로 받아 전송 (감사로그 기록).
