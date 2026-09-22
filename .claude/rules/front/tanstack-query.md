---
description: "TanStack Query 사용 패턴 및 규칙"
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# TanStack Query 패턴

## Query Key 규칙

배열 형태, `as const`, 파일 상단에 상수로 선언

```typescript
// ✅ good
const QUERY_KEYS = {
  items: ["items"] as const,
  itemDetail: (id: string) => ["items", id] as const,
};

// ❌ bad - 인라인 선언
useQuery({ queryKey: ["items"] })
```

## staleTime 전략

| 데이터 성격 | staleTime |
|------------|-----------|
| 자주 안 바뀌는 데이터 | `5 * 60 * 1000` (5분) |
| 실시간성 필요 | `0` |
| 클라이언트 전용 (localStorage 등) | `Infinity` |

## useQuery 패턴

```typescript
export function useItems() {
  return useQuery({
    queryKey: QUERY_KEYS.items,
    queryFn: fetchItems,
    staleTime: 5 * 60 * 1000,
  });
}

// 파생 데이터는 별도 훅으로 분리
export function useItemById(id: string) {
  const { data: items = [] } = useItems();
  return items.find((item) => item.id === id) ?? null;
}
```

## useMutation 패턴

```typescript
export function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateItemInput) => {
      return api.createItem(input);
    },
    onSuccess: () => {
      // 관련 query만 정확히 invalidate
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.items });
    },
  });
}
```

## invalidateQueries 규칙

- mutation 성공 후 반드시 관련 query invalidate
- 영향받는 query만 정확히 지정 (범위 최소화)

## 금지 사항

- ❌ `queryKey` 인라인 문자열 직접 사용
- ❌ mutation 성공 후 invalidate 누락
- ❌ `queryClient.clear()` 남발
