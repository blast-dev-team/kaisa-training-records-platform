---
description: "프론트엔드 보안 패턴 - 클라이언트 데이터 보호, 폼 보안, 서드파티 스크립트"
paths:
  - "**/*.tsx"
  - "**/*.ts"
---

# Security — Frontend

프론트엔드에 적용되는 보안 패턴. 환경변수·스팸 방어 등 공통 사항은 `common/security.md` 참고.

## 클라이언트 번들 보호

- `NEXT_PUBLIC_` 접두사가 붙은 변수만 클라이언트에 노출됨을 인지
- API key, 시크릿, 내부 URL 은 절대 클라이언트 컴포넌트에서 접근하지 않음
- 민감한 로직(인증 검증, 토큰 발급)은 서버 컴포넌트 또는 Route Handler 에서 처리

## 폼 보안

- 공개 폼에는 Honeypot hidden input 추가 (`common/security.md` 참고)
- 클라이언트 측 유효성 검사는 UX 용. **서버 측 검증이 최종 방어선**
- `maxLength`, `type="url"`, `type="email"` 등 HTML 네이티브 제약을 먼저 활용
- 민감한 폼 제출 후 성공 화면에서 입력값 노출하지 않음

## 외부 콘텐츠 렌더링

- 사용자 입력 텍스트는 React 의 기본 이스케이프에 의존 (JSX 내 `{text}`)
- `dangerouslySetInnerHTML` 사용 금지 (불가피하면 DOMPurify 등으로 새니타이징)
- 외부 이미지 URL 렌더링 시 `next.config.js` 의 `remotePatterns` 에 허용 도메인 등록
- 사용자 제공 URL 을 `<a href>` 로 렌더링할 때 `rel="noopener noreferrer"` 추가

## 서드파티 스크립트

- 분석 도구(GA, GTM 등)는 `next/script` 의 `strategy="afterInteractive"` 로 로드
- 서드파티 스크립트에 민감 데이터(사용자 ID, 이메일 등) 전달 시 최소한으로
- 불필요한 서드파티 SDK 로드 지양 (번들 사이즈 + 보안 표면 증가)

## 인증 상태 관리

- 토큰/쿠키는 `httpOnly` + `secure` + `sameSite` 설정 권장
- 클라이언트에서 토큰을 localStorage 에 저장하면 XSS 에 취약 — 가능하면 httpOnly 쿠키 사용
- 인증 상태 변경(로그인/로그아웃) 후 관련 캐시·쿼리 무효화
