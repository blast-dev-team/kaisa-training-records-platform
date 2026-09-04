---
description: "TypeScript 코딩 표준 및 타입 규칙"
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Standards

## 기본 원칙

- `strict` 모드 활성화
- `any` 사용 금지 — 불가피한 경우 `unknown` 사용 후 타입 좁히기
- public API(함수, 훅, 컴포넌트 props)는 모두 타입 명시

## 에러 처리

catch절의 에러는 항상 `unknown`으로 받는다.

```typescript
// ✅
try {
  await fetchData();
} catch (error) {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";
}

// ❌ catch (error: any)
```

## 타입 vs 인터페이스

- 도메인 모델, props → `interface`
- 유니온, 튜플, 유틸리티 타입 조합 → `type`

```typescript
interface UserProfile {
  id: string;
  name: string;
}

type Status = "idle" | "loading" | "success" | "error";
type ApiResponse<T> = { data: T; total: number };
```

## Discriminated Union

상태에 따라 데이터 구조가 달라지는 경우 사용한다.

```typescript
type Result<T> =
  | { status: "success"; data: T }
  | { status: "error"; message: string }
  | { status: "loading" };
```

## 타입 단언 (as)

타입 단언은 최후의 수단이다. 사용 시 이유를 주석으로 명시한다.

```typescript
// ✅ 불가피한 경우 - 이유 명시
const el = document.getElementById("root") as HTMLElement; // 항상 존재 보장됨

// ❌ 이유 없는 단언
const data = response as UserData;
```

## 제네릭

재사용 가능한 유틸리티에 제네릭을 활용한다. 단일 사용처에서 과도한 제네릭은 피한다.

```typescript
// ✅ 재사용되는 유틸
function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> { ... }

// ❌ 한 곳에서만 쓰이는데 제네릭 남용
```

## 금지 사항

- `any` 무분별 사용
- `@ts-ignore` (원인 파악 후 타입 수정)
- 불필요한 타입 단언 (`as`)
