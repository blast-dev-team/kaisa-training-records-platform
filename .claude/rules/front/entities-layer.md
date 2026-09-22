---
description: "Entities 레이어 구조 및 API 패턴"
---

# Entities Layer (엔티티)

엔티티는 도메인 모델과 API 로직을 관리합니다.
mapper는 받은데이터를 model에 설계한 방식으로 map을 합니다.
query는 params로 보통 get에서 사용합니다.

## 구조

```
entities/
└── (엔티티 이름)/
    ├── api/
    │   ├── dto/                        # 백엔드 원본 타입 (raw response)
    │   │   └── (엔티티 이름)-dto.ts
    │   ├── mapper/                     # dto → model 변환
    │   │   ├── map-(엔티티 이름).ts
    │   │   └── map-(엔티티 이름)-detail.ts
    │   ├── query/                      # GET 쿼리 파라미터 타입
    │   │   └── (엔티티 이름)-list-query.ts
    │   ├── get-(엔티티 이름)-list.ts
    │   ├── get-(엔티티 이름)-detail.ts
    │   ├── post-(엔티티 이름).ts
    │   ├── (엔티티 이름)-queries.ts
    │   └── index.ts
    ├── model/                          # 프론트에서 사용하는 도메인 타입
    │   ├── (엔티티 이름).ts
    │   └── (엔티티 이름)-detail.ts
    └── index.ts
```

## 각 파일의 역할

- **dto/**: 백엔드 API 응답 원본 타입. AI 생성 또는 수동 작성. snake_case 그대로 유지
- **mapper/**: dto → model 변환. zod safeParse로 유효성 검사
- **query/**: GET 요청 쿼리 파라미터 타입 정의
- **get-\*-list.ts**: 리스트 조회 API 함수
- **get-\*-detail.ts**: 상세 조회 API 함수
- **post-\*.ts**: mutation API 함수 (prefix: `post-`, `patch-`, `put-`, `delete-`)
- **\*-queries.ts**: TanStack Query queryOptions 정의 (all, lists, list, details, detail)
- **model/**: 프론트에서 사용하는 도메인 타입. camelCase. 상세는 `entities-model.md` 참고
- **index.ts**: queries + mutation API 함수 export

## 예시

```
entities/inquiry/
├── api/
│   ├── dto/
│   │   └── inquiry-dto.ts
│   ├── mapper/
│   │   ├── map-inquiry.ts
│   │   └── map-inquiry-detail.ts
│   ├── query/
│   │   └── inquiry-list-query.ts
│   ├── get-inquiry-list.ts
│   ├── get-inquiry-detail.ts
│   ├── post-inquiry.ts
│   └── inquiry-queries.ts
├── model/
│   ├── inquiry.ts
│   └── inquiry-detail.ts
```

## TanStack Query 패턴

서버 상태 관리는 반드시 TanStack Query의 `queryOptions` 패턴을 사용한다.

### 필수 규칙

- 컴포넌트/뷰에서 **직접 API 함수 호출 금지** (`getSnapshots()` 직접 호출 X)
- 데이터 fetch에 **`useEffect` 사용 금지** (TanStack Query로 대체)
- 모든 GET 요청은 반드시 `*-queries.ts`의 `queryOptions`를 통해 `useQuery`로 호출
- 테스트 페이지, 임시 페이지도 예외 없이 동일하게 적용

### queryOptions 패턴

```typescript
// snapshot-queries.ts
export const snapshotQueries = {
  all: () => ['snapshots'] as const,
  lists: () => [...snapshotQueries.all(), 'list'] as const,
  list: (date: string) =>
    queryOptions({
      queryKey: [...snapshotQueries.lists(), date],
      queryFn: () => getSnapshots(date),
      enabled: !!date,
    }),
};

// 뷰에서 사용
const { data } = useQuery(snapshotQueries.list(date));
```

## model의 규칙

상세 패턴은 `entities-model.md` 참고.
zod 스키마는 `(엔티티명)Schema`, 추출 타입은 `(엔티티명)Type` 네이밍 규칙을 따른다.
