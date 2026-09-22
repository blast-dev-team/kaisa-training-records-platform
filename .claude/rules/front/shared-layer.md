---
description: "Shared 레이어 구조 및 lib vs utils 구분"
---

# Shared Layer (공유 레이어)

프로젝트 전체에서 공유되는 코드를 관리합니다.

## 구조

```
shared/
├── api/                    API 인스턴스 설정 (instance_v2.ts 등)
├── mock-data/              개발용 목 데이터
├── lib/                    라이브러리 래퍼 및 설정
│   └── (라이브러리명)/
│       ├── provider.tsx    라이브러리 Provider 래퍼
│       └── config.ts       라이브러리 기본 설정
├── ui/
│   ├── component/          재사용 가능한 UI 컴포넌트
│   │   └── (컴포넌트명)/
│   │       ├── index.tsx
│   │       ├── types.ts
│   │       ├── styles.ts
│   │       └── (컴포넌트명).tsx
│   ├── theme/              테마 관련 CSS 파일
│   └── utils/              UI 관련 유틸리티 함수
└── utils/                  추가 유틸리티 함수
```

## shared/api — axios 인스턴스

API 호출은 `fetch` 대신 `shared/api/instance.ts`의 axios 인스턴스를 사용한다.

```typescript
// shared/api/instance.ts
import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error ?? error.message ?? "Unknown error";
    return Promise.reject(new Error(message));
  },
);
```

엔티티 API 함수에서는 다음과 같이 사용한다.

```typescript
import { apiClient } from "@/src/shared/api";

export const getSubscriptions = async () => {
  const { data } = await apiClient.get<SubscriptionsResponseType>("/youtube/subscriptions");
  return data;
};
```

- `baseURL: "/api"`로 설정되어 있으므로 엔티티에서는 `/api` 이하 경로만 입력
- 에러는 interceptor에서 `Error`로 변환되므로 별도 status 체크 불필요

## lib vs utils 구분 기준

### `shared/lib/`

외부 라이브러리를 프로젝트에 맞게 감싸거나 설정하는 코드

- 라이브러리 래퍼(wrapper) 컴포넌트
- 라이브러리 초기 설정 및 Provider
- 예시:
  - `shared/lib/react-hook-form/form-provider.tsx`
  - `shared/lib/tanstack-query/query-client.tsx`
  - `shared/lib/suspense/suspense-wrapper.tsx`

### `shared/utils/`

순수 유틸리티 함수 및 비즈니스 로직 헬퍼

- 라이브러리와 무관한 순수 함수
- 라이브러리 기능을 사용하는 유틸 함수
- 예시:
  - `shared/utils/convert-price.ts` - 가격 변환 함수
  - `shared/utils/export-excel.ts` - 엑셀 내보내기 함수
  - `shared/utils/form-validation.ts` - 폼 검증 유틸

## 판단 기준

- 라이브러리를 감싸는가? → `lib/`
- 라이브러리와 무관한 로직인가? → `utils/`
- 라이브러리 기능을 사용하는 유틸인가? → `utils/`
