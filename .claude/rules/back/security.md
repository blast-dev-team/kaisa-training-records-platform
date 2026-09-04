---
description: "백엔드 보안 패턴 - 인증 레이어, Rate Limiting, CORS"
paths:
  - "**/*.guard.ts"
  - "**/*.controller.ts"
  - "**/*.service.ts"
---

# Security — Backend

백엔드 API 서버에 적용되는 보안 패턴. 환경변수·스팸 방어 등 공통 사항은 `common/security.md` 참고.

## 인증 레이어 구분

요청자를 3단계로 구분하고, 각 레이어에 맞는 보호를 적용한다.

| 레이어 | 식별 방법 | 접근 가능 범위 |
|--------|-----------|---------------|
| **공개** | 인증 없음 | 읽기 전용 엔드포인트 |
| **어드민** | API key (헤더) | CRUD 전체 |
| **내부 서비스** | 별도 토큰 (헤더) | 수집기, 배치 작업 전용 |

- 어드민·내부 토큰은 **헤더로** 전달 (URL 파라미터 금지 — 로그에 찍힘)
- 토큰이 미설정이면 해당 Guard 비활성화 (로컬 개발 편의)
- 공개 엔드포인트에 Guard 를 걸지 않음 — 기본이 "공개"

## Rate Limiting (Throttler)

### 기본 정책

- **읽기 (GET/HEAD/OPTIONS)**: throttle 하지 않음
  - SSR 프레임워크(Next.js 등)가 서버 측에서 API 를 호출할 때, 모든 사용자의 요청이 프레임워크 서버 단일 IP 로 뭉쳐 들어옴
  - IP 기반 throttle 을 걸면 전체 사용자가 한 버킷을 공유해 쉽게 429 발생
  - 읽기 전용이라 DB 부하 낮고 mutation 없으므로 개방 안전
- **쓰기 (POST/PATCH/PUT/DELETE)**: 글로벌 기본 제한 적용

### Per-route 제한

공개 쓰기 엔드포인트(문의 폼, 피드백 제출 등)에는 엔드포인트별 타이트한 제한을 건다.

### 인증된 요청 skip

어드민·내부 서비스 요청은 throttle 에서 제외한다. ThrottlerGuard 를 확장해 `shouldSkip` 에서 HTTP 메서드 + 토큰 검증.

## CORS / 헤더

- CORS 는 허용 origin 을 명시적으로 설정 (`*` 지양)
- 민감한 응답에 `Cache-Control: private` 설정
- API key, 토큰 등은 커스텀 헤더로 전달 (`x-api-key`, `x-internal-token`)
