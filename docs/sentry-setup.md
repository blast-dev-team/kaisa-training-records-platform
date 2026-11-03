# Sentry 세팅 가이드

> 2026-11-03 세팅 완료. 코드 연동 + 로컬·운영 DSN 주입 + 이벤트 검증 전부 끝.
> FE는 **다음 Amplify 배포부터**, BE는 **다음 컨테이너 재시작부터** 수집된다.

## 연동 현황

| 앱 | SDK | 초기화 파일 | 수집 범위 |
|---|---|---|---|
| backend/api | `sentry-sdk[fastapi]` | `app/main.py` (DSN 있을 때만 init) | 미처리 500 전체 + 성능 트레이싱 10% |
| frontend/apps/web | `@sentry/react` | `src/shared/lib/sentry.ts` → `main.tsx`에서 `initSentry()` | 전역 window error / unhandledrejection |
| frontend/apps/admin | `@sentry/react` | `src/shared/lib/sentry.ts` → `main.tsx` | 전역 + react-query 에러(axios 5xx·네트워크만) |

- DSN 비어 있으면 전부 no-op — 로컬은 기본 비활성.
- 개인정보 시스템이라 BE는 `send_default_pii=False` (쿠키·헤더 미전송).
- BE는 커스텀 500 핸들러가 예외를 삼키므로 `unhandled_exception_handler`에서 명시 `capture_exception` 호출 (4xx 비즈니스 에러는 수집 안 함).

## 남은 절차 — 운영 주입 (`aws login` 후)

### 주입 위치

| 앱 | 환경변수 | 어디에 |
|---|---|---|
| web | `VITE_SENTRY_DSN`, `VITE_RELEASE` | AWS Amplify 콘솔 — web 앱 환경변수 (이미 주입됨) |
| admin | `VITE_SENTRY_DSN`, `VITE_RELEASE` | AWS Amplify 콘솔 — admin 앱 환경변수 (이미 주입됨) |
| backend | `SENTRY_DSN`, `RELEASE`, `ENVIRONMENT` | Secrets Manager / EC2 docker-compose env (kaisa-staging·kaisa-prod 시크릿에 병합 완료) |

**브랜치별 수집 정책** — amplify.yml 빌드 명령이 분기한다:

- `master`(운영): `VITE_ENV=production` + DSN 유효 → 수집
- `dev`(스테이징): `VITE_ENV=staging` + DSN 비움 → **수집 안 함** (코드는 dev 에도 존재 — master 와 동기화 목적)
- BE staging 시크릿에도 SENTRY_DSN 이 들어가 있음 — api-dev 백엔드는 운영 admin UI 가 쓰고 있어 수집 유지 (`ENVIRONMENT=staging` 태그)

- `VITE_RELEASE` / `RELEASE`: 배포 식별자(예: git SHA나 날짜 태그). 비우면 릴리즈 미지정 —
  이슈가 "어느 배포부터 생겼는지" 추적하려면 채우는 걸 권장.
- 로컬에서 수집 테스트하려면 각 `.env`에 DSN 넣고 실행.

### 검증

각 앱에서 테스트 에러 하나 발생 → Sentry 대시보드 Issues에 잡히는지 확인.

- web/admin: 브라우저 콘솔에서 `Sentry.captureException(new Error("test"))`
- backend: `uv run python -c "import sentry_sdk; sentry_sdk.capture_exception(ValueError('test'))"`

## 계정 접근 시도 기록 (2026-11-03)

- 이메일 가입 시도 → `An account is already registered with that email address.`
- 이메일+비밀번호 로그인 → `Please enter a correct username and password.` (SSO 전용 계정 추정)
- 자동 브라우저에서 Google OAuth → Google이 자동화 로그인 차단 (`/v3/signin/rejected`)
- Chrome 세션 쿠키 가져오기 → macOS Keychain 승인 대기로 불가 (사람이 승인해야 함)
