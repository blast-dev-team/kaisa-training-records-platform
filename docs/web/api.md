# Web 앱 API 가이드 — 회원 포털

> 대상: `frontend/apps/web` (Vite + React SPA, FSD)
> 기준: `backend/api` 라우터 실제 구현 (2026-09-09)
> 이 문서만 보고 entities API 계층을 작성할 수 있게 정리했다.

---

## 1. 공통 사항

### 베이스 URL · 인증

- 모든 경로 앞 `/api` prefix (`/api/health` 참고).
- 인증은 **쿠키 세션** — `kaisa_session` (httponly, samesite=lax, local 외 secure).
- FE는 인증 헤더를 직접 다루지 않는다. `axios` 인스턴스에 `withCredentials: true` 만.
- 로그인 만료 응답: `401` `{code: "UNAUTHORIZED"|"SESSION_EXPIRED"}` → PASS 로그인 페이지로.

### 에러 형태

```json
{ "code": "CERTIFICATE_ALREADY_ISSUED", "message": "이미 발급된 확인서가 있어요. 재발급으로 신청해 주세요" }
```

- `code` (UPPER_SNAKE_CASE) 로 분기, `message` 는 그대로 사용자에게 노출 가능한 한국어.
- 웹에서 자주 만나는 코드:

| code | HTTP | 상황 |
|---|---|---|
| `UNAUTHORIZED` / `SESSION_EXPIRED` | 401 | 미로그인·세션 만료 |
| `TRAINEE_NOT_LINKED` | 403 | PASS 인증은 됐으나 교육생 매칭 전 (`/me/*` 호출 시) |
| `TOO_MANY_ATTEMPTS` | 429 | 진위확인 등 rate limit 초과 |
| `CERTIFICATE_ALREADY_ISSUED` | 409 | 최초 발급 신청인데 이미 있음 → 재발급(`reissue`)으로 |
| `PRICING_RULE_NOT_FOUND` | 409 | 해당 등급×유형 가격 규칙 없음 |
| `PAYMENT_NOT_PAID` | 400 | 결제 완료 전 confirm 호출 |
| `PAYMENT_AMOUNT_MISMATCH` / `PAYMENT_STORE_MISMATCH` | 409 | 결제 검증 실패 |
| `IDENTITY_STATE_MISMATCH` / `IDENTITY_ALREADY_USED` | 400 | PASS state 오류·재사용 |

전체 코드표: `backend/api/app/core/error_codes.py`.

### 날짜·시간

- 서버는 KST. `datetime` 필드는 UTC 오프셋 ISO로 내려오므로 화면 표기 시 `toYMD` 계열 util 사용 (`timestamptz`를 `slice(0,10)`으로 자르지 않는다 — 프로젝트 timezone 룰).
- 날짜 전용 필드(`started_at` 등)는 `YYYY-MM-DD`.

### 금액

- `amount_krw` / `price_krw`: integer, 단위 원.

---

## 2. 주요 플로우

### 2.1 PASS 본인인증 로그인

```
POST /api/auth/pass                      → { redirect_url, state, identity_verification_id }
   브라우저가 redirect_url 이동 (PASS 화면)
   완료 후 서비스로 복귀 (state 가 query 로 돌아옴)
POST /api/auth/pass/complete { state }   → 응답 + Set-Cookie(kaisa_session)
```

응답 `PassCompleteResponse`:

```json
{ "account_type": "user", "id": "<uuid>", "name": "홍길동", "matched": true, "review_status": "approved" }
```

- `matched: true` → 정상 로그인. 포털 진입.
- `matched: false` → CI 매칭 실패. `review_status`(`pending` | `manual_review`)에 따라
  "심사 중" 안내 화면. 어드민 심사(`identity-reviews`) 승인 후 서비스 이용 가능.
- `GET /api/auth/me` — 공통 세션 확인. `account_type: "admin"|"user"` 로 분기 (web에선 user만 취급).

### 2.2 확인서 발급 신청 · 결제

```
GET  /api/me/certificate-price?training_record_id=<uuid>&issue_type=original
POST /api/certificate-requests { training_record_id, issue_type }
```

`issue_type`: `"original"` (최초) | `"reissue"` (재발급 — 기존 확인서는 `superseded` 처리됨).

응답 `CertificateRequestResponse`:

```json
{
  "id": "<uuid>",
  "request_no": "CR-20260909-0001",
  "training_record_id": "<uuid>",
  "issue_type": "original",
  "amount_krw": 1800,
  "currency": "KRW",
  "status": "issued | payment_pending",
  "requested_at": "2026-09-09T02:00:00+00:00",
  "order_no": null,
  "certificate": null
}
```

분기:

| 조건 | status | 다음 동작 |
|---|---|---|
| 가격 0원 (등급 무료) | `issued` | `certificate` 에 발급 완료 정보가 바로 들어옴 → 완료 화면 |
| 유료 | `payment_pending` | `order_no` 로 PortOne 결제 창 호출 → 결제 후 confirm |

결제 확인:

```
POST /api/payments/{order_no}/confirm     (본인 세션 필요)
```

`PaymentConfirmResponse`:

```json
{ "order_no": "PO-...", "status": "paid", "paid_at": "...", "certificate": { "id": "...", "certificate_no": "...", "issued_at": "...", "expires_at": null, "status": "issued" } }
```

- confirm은 **서버가 PortOne에 금액·스토어·PAID 여부를 검증**한 뒤 발급까지 한 트랜잭션으로 완료한다. FE는 결제창 복귀 후 호출만.
- 결제창에서 취소했다면 confirm을 호출하지 않는다 (미결제 상태로 남음 — `PAYMENT_NOT_PAID`).

### 2.3 공개 진위확인 (비인증)

```
POST /api/public/certificate-verifications { certificate_no, issue_date: "YYYY-MM-DD" }
```

`PublicVerificationResponse`:

```json
{ "result": "valid", "certificate_no": "CT-...", "issued_name_masked": "홍**", "course_name": "...", "issued_at": "2026-09-09", "expires_at": null, "message": null }
```

- `result`: `valid` | `expired` | `revoked` | `not_found` | `mismatch`.
- `not_found`/`mismatch` 는 존재 여부 누출 방지로 정보 필드가 null — 동일 형태로 렌더.
- rate limit 10회/60초 (IP 기준) → 초과 시 429 `TOO_MANY_ATTEMPTS`.
- 로그인 없이 누구나 호출 가능한 공개 페이지용.

---

## 3. 엔드포인트 전체 목록

### 인증 (auth)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/auth/pass` | 없음 | PASS 인증 시작 → `redirect_url`, `state` |
| POST | `/api/auth/pass/complete` | 없음 | `{state}` 복귀 처리 → 세션 쿠키 발급 |
| POST | `/api/auth/logout` | 없음 | 세션 종료 → `{ok: true}` |
| GET | `/api/auth/me` | 세션 | 현재 계정 (`account_type` 분기) |

### 내 정보 (me — 회원 세션)

| Method | Path | Query | 설명 |
|---|---|---|---|
| GET | `/api/me/profile` | | 프로필 (이름·마스킹 전화·등급·review_status) |
| GET | `/api/me/training-records` | `from`,`to`,`completion_status` | 내 교육이력 목록 (배열, 페이지네이션 없음) |
| GET | `/api/me/training-records/{record_id}` | | 내 이력 단건 |
| GET | `/api/me/certificates` | | 내 확인서 목록 |
| GET | `/api/me/certificate-requests` | | 발급 신청 내역 |
| GET | `/api/me/payment-orders` | | 결제 주문 내역 |
| GET | `/api/me/certificate-price` | `training_record_id`, `issue_type` | 신청 전 가격 확인 |

### 확인서·결제 (회원 세션)

| Method | Path | Body | 설명 |
|---|---|---|---|
| POST | `/api/certificate-requests` | `{training_record_id, issue_type}` | 발급 신청 (201) |
| POST | `/api/payments/{order_no}/confirm` | — | 결제 검증·발급 확정 |

### 공개

| Method | Path | Body | 설명 |
|---|---|---|---|
| POST | `/api/public/certificate-verifications` | `{certificate_no, issue_date}` | 진위확인 (rate limit) |
| GET | `/api/health` | — | 헬스체크 |

### 주요 응답 스키마 (DTO 원형)

`MeProfileResponse`:

```json
{ "user_id": "...", "trainee_id": "...", "trainee_no": null, "name": "홍길동", "email": null, "phone_masked": "010-****-5678", "grade_name": "일반", "review_status": "approved", "last_login_at": "..." }
```

`TrainingRecordResponse` (목록·단건 공용):

```json
{ "id": "...", "training_record_no": "TR-...", "trainee_id": "...", "course_id": "...", "institution_id": "...", "course_name": "...", "institution_name": "...", "total_hours": 8, "completed_hours": 8, "started_at": "2026-08-01", "ended_at": "2026-08-31", "source": "internal|external|legacy_import", "evidence_file_key": null, "completion_status": "in_progress|completed|canceled", "completed_at": "...", "memo": null, "created_at": "...", "updated_at": "..." }
```

`MyCertificateResponse`:

```json
{ "id": "...", "certificate_no": "CT-...", "training_record_id": "...", "course_name": "...", "institution_name": "...", "total_hours": 8, "completed_hours": 8, "training_started_at": "...", "training_ended_at": "...", "issue_type": "original|reissue", "issued_at": "...", "expires_at": null, "status": "issued|revoked|superseded" }
```

`MyCertificateRequestResponse`:

```json
{ "id": "...", "request_no": "CR-...", "training_record_id": "...", "course_name": "...", "issue_type": "original", "amount_krw": 1800, "status": "pending|payment_pending|paid|issuing|issued|canceled|failed", "requested_at": "...", "paid_at": null, "issued_at": null }
```

`MyPaymentOrderResponse`:

```json
{ "id": "...", "order_no": "PO-...", "certificate_request_id": "...", "amount_krw": 1800, "status": "ready|pending|paid|failed|canceled|partial_refunded|refunded", "paid_at": null, "created_at": "..." }
```

`CertificatePriceResponse`:

```json
{ "training_record_id": "...", "course_name": "...", "issue_type": "original", "grade_name": "일반", "price_krw": 1800, "currency": "KRW" }
```

---

## 4. entities API 작성 가이드 (FSD)

구조·룰은 `.claude/rules/front/entities-layer.md`, `shared-layer.md` 참고. 요약:

```
src/entities/<도메인>/
├── api/
│   ├── dto/<도메인>-dto.ts          # 위 §3 스키마를 snake_case 그대로 타입화
│   ├── mapper/map-<도메인>.ts       # dto → model (camelCase) 변환
│   ├── query/…                      # GET 쿼리 파라미터 타입
│   ├── get-<도메인>-*.ts            # GET 호출 함수
│   ├── post-<도메인>.ts             # mutation 함수
│   └── <도메인>-queries.ts          # queryOptions
├── model/<도메인>.ts                # 화면에서 쓰는 도메인 타입
└── index.ts
```

규칙:

- 호출은 `shared/api/instance.ts` 의 axios 인스턴스(`baseURL: "/api"`, `withCredentials: true`)로만.
- 뷰에서 직접 API 함수 호출 금지 — 반드시 `queryOptions` + `useQuery`/`useMutation`.
- mutation prefix: `post-`, `patch-`.

### 도메인 분할 제안 (web)

| entities 폴더 | 담당 엔드포인트 |
|---|---|
| `entities/auth` | `/auth/pass`, `/auth/pass/complete`, `/auth/logout`, `/auth/me` |
| `entities/me` | `/me/*` 전체 (profile, training-records, certificates, certificate-requests, payment-orders, certificate-price) |
| `entities/certificate-request` | `POST /certificate-requests`, `POST /payments/{order_no}/confirm` — 발급·결제 플로우 |
| `entities/verification` | `POST /public/certificate-verifications` (비인증 공개 페이지) |

`/me/*` 가 서버에서 하나의 도메인(me)으로 묶여 있으므로 entities도 하나로 시작하고, 커지면 `me-certificate`, `me-payment`로 쪼갠다. 스키마가 §3 그대로 dto가 된다.

### 샘플 — `entities/me/api/get-me-profile.ts`

```ts
import { apiClient } from "@/src/shared/api";
import type { MeProfileDto } from "../dto/me-dto";
import { mapMeProfile } from "../mapper/map-me";
import type { MeProfile } from "../../model/me";

export const getMeProfile = async (): Promise<MeProfile> => {
  const { data } = await apiClient.get<MeProfileDto>("/me/profile");
  return mapMeProfile(data);
};
```

```ts
// entities/me/api/me-queries.ts
import { queryOptions } from "@tanstack/react-query";
import { getMeProfile } from "./get-me-profile";

export const meQueries = {
  all: () => ["me"] as const,
  profile: () =>
    queryOptions({
      queryKey: [...meQueries.all(), "profile"],
      queryFn: getMeProfile,
    }),
};
```

- 화면 상태값(`status`, `review_status`, `issue_type` 등)은 dto의 문자열 리터럴 union으로 model에 정의해 타이프세이프하게.
- `phone_masked`, `issued_name_masked` 는 서버가 이미 마스킹해 준 값 — FE에서 추가 가공 금지.
