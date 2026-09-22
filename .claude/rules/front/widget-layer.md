---
description: "Widget 레이어 개발 규칙 - 독립적인 복합 UI 블록"
paths:
  - "src/widgets/**/*.ts"
  - "src/widgets/**/*.tsx"
---

# Widget Layer (위젯 레이어)

여러 feature/entity를 조합한 독립적인 UI 블록을 관리합니다.
페이지에 조립되어 사용되며, 자체적으로 데이터를 가져옵니다.

## entities vs features vs widgets 구분 기준

| | entities | features | widgets |
|--|---------|---------|---------|
| 역할 | 도메인 모델/API | 단일 사용자 액션 | 복합 UI 블록 |
| UI 포함 | 드물게 | 있을 수도 | 항상 |
| 데이터 fetching | ✅ | ✅ | ✅ (내부에서) |

## 구조

```
widgets/
└── (위젯명)/
    ├── ui/
    │   ├── (위젯명).tsx         메인 컴포넌트
    │   └── (서브컴포넌트).tsx   내부 전용 컴포넌트
    └── index.ts
```

## 언제 widget으로 만드나

- 여러 feature/entity를 조합해야 할 때
- 자체 상태와 데이터 fetching이 필요한 UI 블록
- 여러 페이지에서 독립적으로 재사용될 때

## 의존성 규칙

- ✅ `features`, `entities`, `shared` import 가능
- ❌ `views` import 금지
- ❌ 다른 `widgets` import 금지

## index.ts export 규칙

```typescript
export { XxxWidget } from "./ui/xxx-widget";
// 내부 서브컴포넌트는 export하지 않음
```
