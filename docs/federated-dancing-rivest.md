# kaisa 백엔드 — 교육이력 플랫폼 1차 구축 계획

> **산출물**: 승인 즉시 이 계획을 `docs/backend-implementation-plan.md`로 저장(레포 문서화) 후 Phase 0부터 착수.

## Context

kaisa-training-records-platform(감리원 교육이력 조회·확인서 발급 시스템)의 백엔드를 스캐폴드 상태에서 동작하는 서비스로 만든다. 개인정보(교육생 신원·연락처·결제)를 다루므로 보안이 최우선. 폴더 구조·계층·인증 패턴은 gongcar-apps/backend 관례(`.claude/rules/back/fastapi.md`)를 따르되, gongcar의 약점(서명 없는 쿠키)은 개선한다.

**현재 상태**(branch `backend/0908`):
- FastAPI 스캐폴드 — main.py(CORS+health+Scalar), core(config/database/security/response)만 있음
- `security.py` PBKDF2 해시 준비됨, `PagedResponse[T]` 준비됨
- 블로커: `uv.lock` 없음 + `boto3` 의존성 없음(Dockerfile·Secrets 로더 둘 다 깨짐)
- 도메인 코드 0, alembic versions 비어 있음, `get_current_user`/전역 예외 핸들러 없음(프로젝트 룰이 요구)

**확정 결정사항**(사용자 승인 완료):
1. **분리 인증**(DBML v1.1) — (a) **개인회원: PASS(PortOne CI) 로그인** — 로그인할 때마다 본인인증. `users.ci_hash`가 유일 식별자(find-or-create). **승인 게이트 없음 — 인증 성공 즉시 로그인**, 교육생 매칭·등급 판별은 비동기 점검(identity_reviews). 재가입 절차 없음(같은 CI 재로그인 = 계정 복귀). 회원용 이메일/비밀번호 가입·로그인은 없음 (b) **admin: 이메일/비밀번호 + 화이트리스트** — 시드로 마스터 계정 1개 생성(env 기반) → 마스터 로그인 → **허용 이메일 등록(초대)** → 초대된 이메일로 최초 로그인 시 아이디(이메일)+비밀번호로 회원가입(화이트리스트 최초 1회 확인 → status=joined). 이후 접근 제어는 `admin_users.status`(매 로그인, 차단은 여기서만). gongcar `settings` 허용 이메일 패턴 이식
2. **세션 = DB 세션 테이블** `user_sessions`(신규, DBML에 추가) — 랜덤 토큰(256-bit)을 httponly 쿠키로, DB에는 SHA-256 해시만 저장. **고정 TTL 24h**(슬라이딩 없음 — 무효화 semantics 단순화)
3. **범위 = 전체** — PortOne 결제 연동 포함(테스트 채널 키 사용자 보유). DB 모델 20개(v1.1) 전부 + user_sessions 마이그레이션(총 21테이블)

## 세부 확정 사항

| 항목 | 결정 |
|---|---|
| 쿠키 | `kaisa_session`, httponly=True, samesite=**lax**, secure=(ENVIRONMENT != "local"), path="/". 개발은 vite가 `/api`를 127.0.0.1:8000으로 프록시 → same-origin이라 lax 통과. lax는 cross-site POST에 쿠키 미전송 → CSRF 기본 방어 |
| SESSION_SECRET | 불필요 — 토큰이 opaque 랜덤 + 해시 조회 방식이라 서명 키 없음 |
| UUID PK | Python 클라이언트 측 `uuid4`(`UUID(as_uuid=True)` + `default=uuid.uuid4`) — flush 전 id 확인 가능, order→attempt FK 연결 단순 |
| 도메인 | 9개 — `auth`(admin_users·화이트리스트·user_sessions 포함), `trainee`(등급 포함), `institution`(과정 포함), `training_record`(외부수료 포함), `identity`, `certificate`(가격·신청·확인서·진위로그 포함), `payment`, `audit`, `me`(회원 셀프 뷰) |
| 결제 원천 | 서버 측 single-fetch(GET /payments/{paymentId})가 유일한 상태 확정 원천. 웹훅은 트리거일 뿐 — 수신 후 반드시 single-fetch 후 상태 변경 |
| PDF/S3 | 1차 지연. `certificates.pdf_file_key` NULL 허용 그대로. boto3는 Secrets Manager용으로만 추가 |
| Sentry | 범위 외 |

## 기준 문서·규칙

- 스키마: `docs/dbdiagram.io`(**DBML v1.1, 20테이블·UUID PK**) — authoritative. 변경 상세: `docs/dbdiagram-v1.1-changes.md`
  - v1.1 확정: 관리자 분리(`admin_users` + `admin_allowed_emails`), users PASS 전용화(`ci_hash` 단일 식별자), 승인 게이트 제거(본인인증 즉시 로그인), `external_completions` 제거(`training_records`로 통합), 감사·승인 FK 전부 `admin_users`로
- 신규 테이블 `user_sessions`(세션 — 결정 #2) — DBML 미포함. 구현 시 `docs/dbdiagram.io`·`docs/db-schema.md`에 반영(db-planning 게이트)
- `back/fastapi.md`(도메인 구조·계층·네이밍), `back/api-design.md`(응답·에러코드·페이지네이션), `project/db-planning.md`(문서 선행·db-schema.md/db-diagram.dbml 동기화), `project/timezone.md`(KST 고정)

---

## Phase 0 — 로컬 실행 준비 + 공통 인프라 (~8파일)

1. **의존성**: `uv add cryptography boto3` → uv.lock 생성(Dockerfile 블로커 해소). verify: `uv sync && uv run python -c "import cryptography, boto3"`, `make build`
2. **config.py Settings 추가**: `CORS_ORIGINS`(쉼표 구분, 비면 [FRONTEND_URL] fallback), `SESSION_COOKIE_NAME="kaisa_session"`, `SESSION_TTL_HOURS=24`, `CRYPTO_KEY`(Fernet), `IP_HASH_SALT`(비면 CRYPTO_KEY 사용), `PORTONE_API_BASE/STORE_ID/API_SECRET/PAYMENT_CHANNEL_KEY/IDENTITY_CHANNEL_KEY/WEBHOOK_SECRET`, `RATE_LIMIT_LOGIN_MAX=5`·`WINDOW=300`, `RATE_LIMIT_PUBLIC_VERIFY_MAX=10`·`WINDOW=60`, `CERTIFICATE_VALID_DAYS=0`(0=무기한). `.env.example` 전부 + `ADMIN_EMAIL/ADMIN_PASSWORD`(시드용) 추가
3. **core 신규**:
   - `app/core/kst.py` — `now_kst/today_kst/ensure_kst/kst_range_start/kst_range_end/to_kst_date`(timezone.md 그대로)
   - `app/core/crypto.py` — `encrypt_field/decrypt_field`(Fernet, 키 없으면 boot 시 ValueError), `sha256_hex`(CI/DI/IP), `mask_phone("01012345678")→"010-****-1234"`, `mask_name("홍길동")→"홍**"`
   - `app/core/error_codes.py` — UPPER_SNAKE 코드 + 한국어 메시지 매핑. `INVALID_CREDENTIALS`, `DUPLICATE_EMAIL`, `WEAK_PASSWORD`, `EMAIL_NOT_ALLOWED`(403, 초대 없는 가입), `ACCOUNT_DISABLED`(403, admin_users.status=disabled), `TOO_MANY_ATTEMPTS`, `TRAINEE_NOT_LINKED`(403), `IDENTITY_STATE_MISMATCH`, `PAYMENT_AMOUNT_MISMATCH`, `WEBHOOK_SIGNATURE_INVALID` 등
4. **main.py** — 전역 예외 핸들러 3종(gongcar 패턴): HTTPException dict-detail 언랩 / RequestValidationError → 422 VALIDATION_ERROR + errors 배열 / Exception → 500 INTERNAL_ERROR(내부 미노출)

verify: `make dev` 부팅 → `/api/health` 200, 422 응답 새 형태 curl 확인

## Phase 1 — 스키마 문서 + 전체 모델 + 초기 마이그레이션 + 시드 (~38파일)

1. **문서 선행**(db-planning.md 순서): `docs/db-schema.md` 신규(21테이블 전체 컬럼 정의서 — v1.1 20테이블 + user_sessions). 기준 DBML은 `docs/dbdiagram.io`(v1.1). user_sessions 추가분의 dbdiagram.io 반영은 팀 확인 후 수동 진행
2. **모델** — 도메인별 `model/{entity}.py` + `enums.py`(`str, enum.Enum`, 컬럼은 String):
   - auth/{admin_users, admin_allowed_emails, user_sessions}, user/users(PASS 전용 — email/password 컬럼 없음, ci_hash unique), trainee/{trainees, membership_grades, trainee_grade_histories}, identity/{identity_verifications, identity_reviews}, institution/{training_institutions, training_courses}, training_record/{training_records}, certificate/{certificates, certificate_requests, certificate_pricing_rules, certificate_verification_logs}, payment/{payment_orders, payment_attempts, payment_refunds, payment_webhook_events}, audit/audit_logs(actor_admin_id → admin_users)
   - 공통: `Mapped[T]`+`mapped_column`, timestamptz=`DateTime(timezone=True)`+`server_default=func.now()`, `numeric(8,2)`=`Numeric`(Decimal, Float 금지), date=`Date`, DBML 인덱스·unique 제약 그대로
   - `app/domain/__init__.py` 전 도메인 모델 import(`# noqa: F401`) — alembic/env.py가 `import app.domain`으로 metadata 수집
3. **마이그레이션**: `make migration name="initial schema"` 1회 autogenerate → 전수 수동 리뷰(21테이블, 인덱스·unique·JSONB·UUID 확인). 이후 수작성 원칙
4. **시드**: `backend/api/scripts/seed.py` + `make seed`. 멱등. **마스터 admin 계정**(admin_users, env 기반 ADMIN_EMAIL/ADMIN_PASSWORD, 기본 admin@kaisa.local), 등급 3종, pricing rules(임시값 주석), 기관 2·과정 3, trainee 3(1명은 CI 보유 이관분 — users 행을 ci_hash로 선생성해 user_id 연결, 1명은 CI 없는 이관분 — manual_review 시나리오), 교육이력 각 2건(source internal·external 혼합, external에 evidence_file_key 더미)

verify: `make reset && make seed` → `make db-shell` `\dt` 21테이블

## Phase 2 — 인증/세션/사용자 관리 (~25파일)

- `core/session.py` — 토큰 생성(`secrets.token_urlsafe(32)`), 해시 저장/조회, 만료 검증
- `core/rate_limit.py` — in-memory sliding-window(키=email+ip_hash). 로그인 실패 5회/5분 → 429. workers=1 전제 주석 명시
- `core/audit.py` — `record_audit(db, actor, action, entity_type, entity_id, before, after)`. `db.add`만, 커밋은 호출자 트랜잭션과 함께
- `core/dependencies.py` 확장 — `get_current_user`(쿠키→해시조회→세션 만료 검증), `require_admin`(admin_users.status=active 확인 — disabled는 즉시 차단), `get_current_trainee`(user→trainee 연결 조회, 없으면 403 TRAINEE_NOT_LINKED). **이후 모든 회원 쿼리는 이 trainee로 scope — 클라이언트 trainee_id 절대 신뢰 금지**
- **auth 도메인** — 로그인 2종:
  - **admin 이메일/비밀번호: 화이트리스트 → 가입 → 로그인**:
    - `POST /api/auth/register` (공개) — email+password. **admin_allowed_emails에 status=pending row가 있는 이메일만 가입 허용** — 없으면 403 EMAIL_NOT_ALLOWED. 가입 성공 시 status=joined + joined_admin_id 세팅(화이트리스트는 최초 가입 게이트로만 사용). 이메일 중복 409 DUPLICATE_EMAIL, 비밀번호 10자 이상 영+숫자 → 400 WEAK_PASSWORD
    - `POST /api/auth/login` (공개+rate limit) — verify → 세션 발급 → Set-Cookie. status=disabled면 403 ACCOUNT_DISABLED. PBKDF2 기존 `core/security.py` 재사용 + `validate_password()` 추가
  - **개인회원: PASS 로그인** — PortOne 본인인증 흐름 자체가 로그인(Phase 5에서 구현, 인프라는 Phase 2에서 준비). 회원용 register·email/password 없음
  - logout, me 공통
- **admin 계정 관리(super)**: `GET /api/admin-users`, `PATCH /api/admin-users/{id}`(status on/off, audit) — 차단은 admin_users.status로만(화이트리스트 제거는 기존 가입자 유지, 차단 수단 아님)

엔드포인트: `POST /api/auth/register` · `/api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` · `GET/POST/DELETE /api/admin-allowed-emails`(admin) + `GET/PATCH /api/admin-users`(super). 회원 PASS 로그인은 Phase 5 추가

verify: curl 로그인 → Set-Cookie(httponly) → /auth/me → 오류 비번 5회 → 429 → disabled(admin) 403 → logout 후 쿠키 재사용 401 → 초대 없는 이메일 register → 403 EMAIL_NOT_ALLOWED → 초대 후 register 성공·재가입 409

## Phase 3 — 관리자 마스터 도메인 (~48파일)

- **institution**: 기관 CRUD + `course_router`(과정 = 기관 하위 마스터, 멀티라우터). 삭제 대신 `is_active` 토글
- **trainee**: 목록(페이지, search=name/trainee_no — **전화번호 검색 불가, 암호화 저장 특성. 문서 명시**), 상세(phone decrypt→mask), PATCH(grade 변경 시 `trainee_grade_histories` insert + audit), membership-grades CRUD
- **training_record**(외부수료 통합 — v1.1): 어드민 이력 CRUD(스냅샷 컬럼 채움, DELETE=소프트딜리트). 외부 수료도 동일 CRUD로 등록 — `source='external'` + 기관·과정 마스터 연결 + `evidence_file_key`(증빙파일) 첨부
- **audit**: `GET /api/audit-logs`(entity_type/entity_id/actor 필터)

엔드포인트: institutions·courses·membership-grades·trainees·training-records·audit-logs. 전부 admin + mutation마다 record_audit

verify: 일반 유저 쿠키로 403, admin CRUD + grade 변경 시 history/audit row 확인

## Phase 4 — 회원 포털 `me` 도메인 (~10파일)

model 없는 뷰 전용 — 타 도메인 repository를 trainee 스코프로 호출. 소유권은 `get_current_trainee` + 쿼리 주입.

`GET /api/me/profile` · `/me/training-records`(from/to/status, kst_range_* 경계) · `/me/training-records/{id}`(타인 id→404) · `/me/certificates` · `/me/certificate-requests` · `/me/payment-orders` · `/me/certificate-price?training_record_id=&issue_type=`

> **미결(v1.1)** — 회원 직접 외부수료 신청 경로가 DBML에서 사라짐(`external_completions` 제거). 1차는 어드민 등록으로 운영하고, 회원 셀프 신청이 필요해지면 요청 테이블 설계부터 다시 확정 필요

verify: seed pre-link 유저로 자기 이력만 조회(다른 trainee record → 404) 통합테스트 고정

## Phase 5 — PortOne 본인인증 + identity 도메인 (~19파일)

- `app/integrations/portone.py` — httpx.AsyncClient, `Authorization: ApiKey`. `get_payment`, `cancel_payment`, `create_identity_verification`, `get_identity_verification`, `verify_webhook_signature`(정확한 서명 형식은 구현 시 PortOne 문서 조회해 맞춤 — 서명 실패 400, 상태 변경은 항상 single-fetch 후라 이중 방어)
- **회원 PASS 로그인 흐름**(auth ↔ identity 협력, `identity_verifications`가 로그인 이력 겸함 — 매 로그인마다 row 생성):
  1. `POST /api/auth/pass` (공개) — iv_id=`IV-{uuid4.hex}`, state 랜덤 → identity_verifications insert(pending, redirect_state_hash, +10분 만료) → PortOne create → `{identity_verification_id, channel_key}` 반환
  2. 리다이렉트 복귀 후 `POST /api/auth/pass/complete` body `{state}` (공개) — 해시 일치(불일치 400 IDENTITY_STATE_MISMATCH)·만료 검사 → PortOne single-fetch → VERIFIED면 ci/di **즉시 해시 후 폐기**, 인증 row 갱신 → **`users.ci_hash`로 find-or-create**:
     - 기존 user 있음 → 세션 발급 (재로그인 = 계정 복귀)
     - 없음 → users 생성 + **세션 즉시 발급** — 승인 게이트 없음(v1.1)
     - **구현 시 변경(v2)**: `identity_verifications.user_id` NOT NULL 이라 인증 row 는 complete 시점에 생성. 시작 시점 state 는 서명된 자기수증 토큰(HMAC, TTL 10분 — `core/security.issue_state/read_state`)으로 대체했고 재생은 provider_verification_id unique 사전검사로 차단(400 IDENTITY_ALREADY_USED). DBML 이 source of truth 라 스키마 대신 플로우 수정
  3. **매칭·등급 판별은 비동기 점검(로그인 제한 안 함)** — 세션 발급과 별개로 identity_reviews 생성:
     - CI 보유 이관분은 이관 시 users 행·user_id 연결이 돼 있어 approved(matched_by=ci) 처리
     - 매칭 안 됨 → manual_review → 어드민 심사: `GET /api/identity-reviews`(status 필터), `POST .../approve` body `{trainee_id, determined_grade_id?}`(수동 매칭 + trainee.user_id 연결 + 등급 확정 + audit), `/reject` body `{review_note}`. 심사 전에도 로그인·이력 조회는 가능하며, 심사 결과로 trainees.review_status·등급이 확정됨
- 회원은 매 로그인마다 PASS 인증 1회 — 세션 TTL 24h가 재인증 주기 상한
- 테스트 채널은 웹훅 미발송 가능 → 로컬은 confirm(single-fetch) 경로로 검증

verify: portone 함수 monkeypatch 통합테스트

## Phase 6 — 확인서 발급 + 결제 + 공개 진위확인 (~40파일)

- **pricing admin**: `GET/POST /api/certificate-pricing-rules`, `PATCH /{id}`. 유효규칙 선택(grade×issue_type, valid 구간, is_active)은 순수함수로 분리해 단위테스트
- **`POST /api/certificate-requests`**(user+trainee) body `{training_record_id, issue_type}` — 서버 전량 재판별: 소유/완료상태, **등급 판별 완료**(trainees.review_status=approved + membership_grade_id 확정 — 미판별이면 400), 가격 조회 → request(amount 스냅샷) + payment_order(order_no=`ORD-{yyyymmdd}-{token_hex(6)}` = PortOne paymentId) 생성. 재발급 previous는 서버가 자동 지정. **0원이면 결제 없이 즉시 paid→발급**
- **발급**: certificate_no=`CERT-{yyyymmdd}-{seq}`, 스냅샷 채움, expires_at(CERTIFICATE_VALID_DAYS), 재발급 시 기존 cert superseded. 결제 confirm과 동일 트랜잭션
- **어드민**: `GET /api/certificates`, `POST /{id}/revoke`(audit)
- **공개 진위확인**: `POST /api/public/certificate-verifications` body `{certificate_no, issue_date}` — 인증 없음 + IP rate limit(10/min). unique 조회 → issued_at KST date 비교 → valid/expired/revoked/not_found/mismatch. 응답은 mask_name + 과정명만. not_found/mismatch도 로그(certificate_verification_logs, ip_hash)
- **payment**: `POST /api/payments/{payment_id}/confirm`(user+trainee) — 내 주문 조회(타인→404) → single-fetch → 검증(PAID, amount 일치, KRW, storeId) → attempt upsert → paid → 발급 → `{certificate}`. 이미 paid면 멱등 반환. `POST /api/payments/webhooks/portone`(공개) — (provider, provider_event_id) unique로 중복 skip → 서명 검증 → confirm 재사용. 어드민: `GET /api/payment-orders`, `POST /{id}/refunds`(PortOne cancel → refunds row → order 상태)

verify: 목킹 e2e — 신청→confirm→발급, 금액 불일치 409, 웹훅 리플레이 멱등, 0원 즉시발급, 재발급 supersede

> **구현 시 변경 (2026-09-09 검증 완료)**
> - `GET /me/certificates` 가 500 나는 버그 수정 — `issue_type` 이 `certificates` 가 아닌
>   `certificate_requests` 에 있어 `MyCertificateResponse.model_validate` 이 실패했다.
>   조인으로 가져오고 `from_orm_with_issue_type` 팩토리로 조립.
> - `api_error` 미등록 코드가 조용히 500 되는 버그 수정 — 서비스가 쓰는 코드 13개가
>   `_ERRORS` 레지스트리에 없었다. 전부 등록(400~503). refund 검증 중 발견.
> - **환불은 확인서를 revoke 하지 않는다** — 이미 지급된 사실은 되돌리지 않고
>   `payment_refunds` row + order refunded 만 기록. 확인서 무효화는 어드민 revoke 별도 경로.
> - e2e 전 항목 통과: 0원 즉시발급 / 유료 신청→confirm→발급 / 금액 위조 409 /
>   store 불일치 409 / 웹훅 bad-sig 400 / unknown order 200 order_found:false /
>   API 미설정 200 confirmed:false(롤백) / 리플레이 duplicate / confirm 멱등 /
>   원본 재신청 409 / 재발급 supersede / me 목록 issue_type / 공개 진위확인
>   valid·mismatch·not_found·revoked + 마스킹("김**") + 429 / admin revoke / refund.

## Phase 7 — 테스트 보강 + 문서 마감 (~8파일)

- `backend/api/tests/conftest.py` — TEST_DATABASE_URL(`kaisa_test`), session fixture에서 alembic upgrade head(create_all 금지 유지), TRUNCATE, portone monkeypatch fixture
- 단위(무DB): crypto roundtrip/마스킹, kst(KST 새벽 경계), 비밀번호 정책, pricing 선택, 웹훅 서명
- 통합: 인증 라이프사이클/세션 만료/429, **소유권(타인 리소스 404)**, status 게이트, identity 매칭(auto/manual/reject), 결제 멱등·금액 위조·웹훅 중복, 진위확인 마스킹·로그·limit, audit row
- `backend/api/README.md` 갱신, `make test` green

## Phase 요약

| Phase | 내용 | 파일 | 검증 |
|---|---|---|---|
| 0 | uv.lock/env/core(kst·crypto·errors)/핸들러 | ~8 | uv sync, 부팅, /api/health |
| 1 | 스키마 문서(db-schema.md·v1.1 기준), 전 모델(21테이블), 초기 migration, seed | ~38 | make reset && make seed, \dt 21 |
| 2 | auth/session/rate limit/audit, user 도메인 | ~25 | curl 로그인 사이클 |
| 3 | 어드민 마스터 4도메인 + audit 조회 | ~48 | admin CRUD + audit row |
| 4 | me 포털 | ~10 | 소유권 통합테스트 |
| 5 | PortOne 인증 + identity | ~19 | 목킹 통합테스트 |
| 6 | 확인서·결제·공개 진위확인 | ~40 | 결제 플로우 목킹 e2e |
| 7 | 테스트 마감·문서 | ~8 | make test green |

## 보안 원칙 (전 Phase 공통)

- CI/DI/IP **원문 절대 저장 금지** — 수신 즉시 sha256_hex. 로그에 PII 미노출(요청 바디 로깅 금지)
- phone은 Fernet 암호화, 응답은 항상 마스킹(어드민 상세 포함)
- 회원 데이터는 `get_current_trainee` 스코프 강제 — 클라이언트 id 신뢰 금지, 타인 리소스는 404
- 500 응답 내부 정보 미노출, 상세는 서버 로그만

## 리스크/주의

1. autogenerate는 초기 1회만 + 전수 리뷰(인덱스·unique 눕·불필요한 DROP). 이후 수작성
2. Numeric은 Decimal — 스키마 직렬화 시에만 float
3. order_no 재사용 시 PortOne 거부 — 재시도는 신규 주문 생성(자연 멱등)
4. rate limit in-memory는 workers=1 전제 — 다중 워커 시 공유 저장소 교체 필요
5. 웹훅 서명 형식은 구현 시 PortOne 문서 확인
6. `docs/dbdiagram.io` 변경은 팀 확인 후(db-planning 게이트). user_sessions 추가분 포함
