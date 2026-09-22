---
description: "테스트 작성 가이드라인"
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/__tests__/**"
---

# Testing Guidelines

## 테스트 도구

- Vitest
- @testing-library/react

## 테스트 전략

### 컴포넌트 테스트

재사용 가능한 컴포넌트는 격리하여 단위 테스트한다.
- props와 사용자 상호작용에 집중
- 외부 의존성(API, 라우팅)은 mock 처리

### 페이지 테스트

페이지 레벨은 사용자 시나리오 기반 통합 테스트를 우선한다.
- 외부 의존성(API 호출, toast)만 mock
- 내부 컴포넌트는 실제로 렌더링

## Testing Library 쿼리 우선순위

사용자가 실제로 상호작용하는 방식과 가깝게 요소를 찾는다.

```typescript
// ✅ 권장 순서
screen.getByRole("button", { name: "저장" });   // 1. role
screen.getByLabelText(/이메일/);                 // 2. label
screen.getByPlaceholderText("검색...");          // 3. placeholder
screen.getByText("저장되었습니다.");              // 4. text

// ❌ 최후의 수단
screen.getByTestId("save-button");              // data-testid는 가능한 피함
```

## 테스트 파일 위치

테스트 파일은 테스트 대상과 같은 디렉토리에 위치한다.

```
button.tsx
button.test.tsx   ← 같은 폴더
```

## 테스트 유틸리티

공통 헬퍼 함수는 `src/test/` 또는 `src/shared/test/`에 모아둔다.
- `createTestQueryClient()` — 테스트용 QueryClient
- `renderWithProviders()` — Provider 래핑 헬퍼

## 원칙

- 순수 함수, 유틸리티, 커스텀 훅은 테스트 작성 권장
- SSR이 필요한 훅은 SSR 시나리오도 포함
- 스타일 변경, 프로토타입은 테스트 생략 가능
