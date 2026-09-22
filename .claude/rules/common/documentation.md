---
description: "문서화 가이드라인 — JSDoc, README, CHANGELOG"
---

# Documentation Guidelines

## JSDoc

복잡하거나 외부에서 사용하는 함수에만 작성한다.
자명한 함수나 내부 구현 세부사항에는 불필요하다.

```typescript
// ✅ JSDoc이 필요한 경우 — 동작이 직관적이지 않거나 예시가 필요
/**
 * 구독 날짜를 상대적인 문자열로 변환
 * @example formatRelativeDate('2024-01-01') // '1년 전'
 */
export function formatRelativeDate(dateStr: string): string { ... }

// ❌ JSDoc 불필요 — 이름만 봐도 명확
export function isValidEmail(email: string): boolean { ... }
export function formatPrice(price: number): string { ... }
```

## README

프로젝트 루트 README에는 최소한 아래 내용을 포함한다.

```markdown
## 시작하기
# 설치 및 실행 방법 (복사해서 바로 쓸 수 있게)

## 환경변수
# 필요한 env 목록과 설명 (.env.example 참고 링크)

## 프로젝트 구조
# 주요 폴더와 역할 (선택, 복잡한 프로젝트에만)

## 배포
# 배포 방법 또는 CI/CD 설명
```

- 설치/실행 명령어는 복사해서 바로 실행 가능하게 작성
- 스크린샷이나 데모 링크가 있으면 상단에 배치
- 오래된 README가 없는 것보다 나쁨 → 변경 시 같이 업데이트

## CHANGELOG

변경사항은 반드시 CHANGELOG.md에 기록한다. 형식은 `changelog.md` 참고.

- 기능 추가/변경/삭제마다 `[Unreleased]` 섹션에 추가
- 배포 시 버전 섹션으로 이동

## 주석

코드 주석은 **왜**를 설명한다. **무엇**은 코드가 이미 말하고 있다.

```typescript
// ❌ 무엇을 설명 (코드와 중복)
// userId로 유저를 찾는다
const user = await findUser(userId)

// ✅ 왜를 설명
// 삭제된 유저도 히스토리 조회를 위해 포함
const user = await findUser(userId, { includeDeleted: true })
```

TODO 주석은 이슈 트래커 링크와 함께:

```typescript
// TODO(#123): 페이지네이션 추가 필요
```
