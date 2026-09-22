---
description: "Feature 레이어 개발 규칙 - 비즈니스 기능 단위"
paths:
  - "src/features/**/*.ts"
  - "src/features/**/*.tsx"
---

# Features Layer (피처 레이어)

사용자 행동(액션) 단위의 비즈니스 기능을 관리합니다.
entities를 조합해 실제 동작을 구현하는 레이어입니다.

## 구조

```
features/
└── (기능명)/
    ├── api/        서버 통신 훅
    ├── ui/         기능 전용 UI 컴포넌트
    ├── lib/        기능 전용 유틸/로직
    ├── model/      기능 전용 타입 (필요 시)
    └── index.ts    public API export
```

## 네이밍 규칙

- 폴더명: `kebab-case`, 동사+명사 형태 권장
- 훅: 기능 동작을 명확히 표현 (`useSaveXxx`, `useApplyXxx`)
- UI: 기능명 접두사 (`XxxModal`, `XxxButton`)

## index.ts export 규칙

```typescript
// 사용하는 쪽에서 필요한 것만 export
export { useXxx, useSaveXxx } from "./api/use-xxx";
export { XxxModal } from "./ui/xxx-modal";
```

## 의존성 규칙

- ✅ `entities`, `shared` import 가능
- ❌ 다른 `features` import 금지 (순환 의존성 방지)
- ❌ `views`, `widgets` import 금지

## 주의사항

- feature는 하나의 사용자 액션에 집중
- 여러 feature에서 쓰이는 로직은 `entities` 또는 `shared`로 이동
- UI가 없는 feature도 정상 (api/lib만 있는 경우)
