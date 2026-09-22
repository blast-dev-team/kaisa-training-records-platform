---
description: "테스트 전략 및 작성 기준 — 프레임워크 무관 공통 원칙"
---

# Testing Guidelines

## 테스트 피라미드

```
       /  E2E  \        소수 — 핵심 사용자 흐름만
      /----------\
     / Integration \    중간 — API, DB, 외부 서비스 경계
    /--------------\
   /   Unit Tests   \   다수 — 순수 함수, 비즈니스 로직
  /------------------\
```

많은 단위 테스트로 빠른 피드백, 적은 E2E로 핵심 흐름 보장.

## 무엇을 테스트할 것인가

### 반드시 테스트

- **순수 함수** — 입력 → 출력이 명확한 유틸리티 함수
- **비즈니스 로직** — 도메인 규칙, 계산, 변환 로직
- **커스텀 훅** — 상태 변화와 사이드이펙트
- **API 경계** — 요청/응답 포맷, 에러 케이스

### 테스트 생략 가능

- 단순 스타일 변경
- 프로토타입/실험적 코드 (사용자가 명시적으로 제외 요청 시)
- 프레임워크가 이미 보장하는 동작 (e.g. React 렌더링 자체)
- 설정 파일, 상수 파일

## 좋은 테스트 작성법

### 구조 — AAA 패턴

```
Arrange  → 테스트 환경 설정, 입력 준비
Act      → 테스트 대상 실행
Assert   → 결과 검증
```

```typescript
it('이메일이 유효하지 않으면 false를 반환한다', () => {
  // Arrange
  const invalidEmail = 'not-an-email'

  // Act
  const result = isValidEmail(invalidEmail)

  // Assert
  expect(result).toBe(false)
})
```

### 테스트 이름

- **한국어 또는 영어 일관성 유지**
- "무엇을 할 때 어떻게 된다" 형태로 작성

```
✅ '이메일이 없으면 에러를 던진다'
✅ 'returns null when user is not found'
❌ 'test1'
❌ 'works correctly'
```

### 한 테스트, 한 관심사

테스트 하나에 검증 포인트는 하나. 여러 개 검증이 필요하면 테스트 분리.

```typescript
// ❌ 여러 관심사
it('유저 생성', () => {
  expect(user.id).toBeDefined()
  expect(user.email).toBe('test@example.com')
  expect(sendWelcomeMail).toHaveBeenCalled()
})

// ✅ 분리
it('생성된 유저는 id를 갖는다', ...)
it('생성된 유저의 이메일이 저장된다', ...)
it('유저 생성 시 웰컴 메일을 발송한다', ...)
```

## 모킹(Mocking) 원칙

- **외부 서비스**(Slack, 이메일, 결제 등)는 mock
- **내부 DB**는 가능하면 실제 DB 사용 (mock은 prod 동작과 다를 수 있음)
- mock은 최소화 — mock이 많을수록 테스트가 구현 세부사항에 묶임

```typescript
// ✅ 외부 서비스 mock
jest.mock('../slack/slack.service')

// ❌ 내부 로직까지 과도하게 mock → 테스트 의미 퇴색
jest.mock('../rule/rule.service')
```

## 커버리지

- 커버리지 숫자 자체가 목표가 아님
- **비즈니스 로직 100%** > 전체 파일 70%
- 커버리지가 낮아도 핵심 경로가 검증되면 OK
- 커버리지가 높아도 의미 없는 테스트면 무의미

## 테스트 파일 위치

대상 파일과 같은 위치에 `.test.` 접미사로 배치.

```
utils/format-date.ts
utils/format-date.test.ts

hooks/use-user.ts
hooks/use-user.test.ts
```
