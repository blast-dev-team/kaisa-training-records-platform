---
description: "Entities API 구현 패턴 - API 함수, mapper, query, queries 상세 가이드"
paths:
  - "src/entities/**"
---

# Entities API 패턴

구조 개요는 `entities-layer.md` 참고. 여기선 각 파일의 구현 패턴을 다룬다.

## API 함수 패턴

HTTP 메서드를 파일명 접두사로 사용한다. (`get-`, `post-`, `patch-`, `put-`, `delete-`)
API 함수는 fetch만 담당하고 변환 로직은 포함하지 않는다.

```typescript
// get-chat-list.ts
export const getChatList = async (params?: GetChatListParams): Promise<ChatListResponse> => {
  const response = await fetch(`/api/chats?${new URLSearchParams(params)}`);
  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status}`);
  }
  return response.json();
};
```

## query 패턴

GET 요청의 쿼리 파라미터 타입은 `query/` 폴더에 분리한다.

```typescript
// query/chat-list-query.ts
export interface ChatListQuery {
  page?: number;
  pageSize?: number;
  userId: string;
}
```

## dto 패턴

백엔드 응답 원본 타입은 `dto/` 폴더에 정의한다. AI 생성 또는 수동 작성.
필드명은 백엔드 그대로 유지한다 (snake_case).

```typescript
// dto/chat-title-list-dto.ts
export interface ChatTitleListDto {
  session_id: string;
  title: string;
  created_at: string;
  updated_at?: string;
}
```

## mapper 패턴

dto를 받아 model의 Schema로 변환한다. zod `safeParse`로 유효성 검사 후 반환한다.
파싱 실패 시 `undefined`를 반환하고 `console.error`로 반드시 기록한다.
`undefined`는 호출부(`select`)에서 `filter`로 제거한다.
이 패턴은 의도적으로 유효하지 않은 데이터를 걸러내기 위한 것이다.

```typescript
// mapper/map-chat.ts
import { ChatSchema } from '../model/chat';
import { ChatDto } from '../dto/chat-dto';

export const mapChat = (item: ChatDto) => {
  const result = ChatSchema.safeParse({
    id: item.session_id,
    title: item.title || 'Untitled',
    createdAt: item.created_at,
  });
  if (!result.success) {
    console.error('[mapChat] 파싱 실패:', result.error);
    return undefined;
  }
  return result.data;
};
```

## queries 패턴

`(엔티티명)-queries.ts`에 TanStack Query의 `queryOptions`를 계층적으로 정의한다.
**mapper는 `select` 안에서 호출한다.** 이렇게 하면 원본 API 함수(`queryFn`)를 그대로 살려두면서 필요한 경우 변환 없이 raw 데이터를 직접 쓸 수도 있다.

### 쿼리 키 계층 구조

`all → lists → list`, `all → details → detail` 구조를 따른다.
`lists`, `details`는 키 전용 함수로, `invalidateQueries` 범위 조절에 사용한다.

```
all()           → ['chat']                          전체 무효화
lists()         → ['chat', 'list']                  목록 관련 전체 무효화
list(params)    → ['chat', 'list', params]          특정 목록 무효화
details()       → ['chat', 'detail']                상세 관련 전체 무효화
detail(id)      → ['chat', 'detail', id]            특정 상세 무효화
```

```typescript
// chat-queries.ts
import { queryOptions, infiniteQueryOptions } from '@tanstack/react-query';

export const chatQueries = {
  all: () => ['chat'],

  lists: () => [...chatQueries.all(), 'list'],
  list: (params?: ChatListQuery) =>
    queryOptions({
      queryKey: [...chatQueries.lists(), params],
      queryFn: () => getChatList(params),       // 원본 API 호출 유지
      select: (data) =>
        data.items.map(mapChat).filter((item): item is ChatType => item !== undefined),
    }),

  // 무한 스크롤이 필요한 경우
  listInfinite: (params?: Omit<ChatListQuery, 'page'>) =>
    infiniteQueryOptions({
      queryKey: [...chatQueries.lists(), 'infinite', params],
      queryFn: ({ pageParam = 1 }) => getChatList({ ...params, page: pageParam }),
      initialPageParam: 1,
      getNextPageParam: (lastPage, allPages) => {
        const totalPages = Math.ceil(lastPage.total / (lastPage.limit ?? 10));
        const next = allPages.length + 1;
        return next <= totalPages ? next : undefined;
      },
      select: (data) => ({
        ...data,
        items: data.pages
          .flatMap((page) => page.items.map(mapChat))
          .filter((item): item is ChatType => item !== undefined),
      }),
    }),

  details: () => [...chatQueries.all(), 'detail'],
  detail: (id: string) =>
    queryOptions({
      queryKey: [...chatQueries.details(), id],
      queryFn: () => getChatDetail(id),
    }),
};
```

## index.ts

`queries` 객체는 항상 export한다.
mutation API 함수(`post-`, `patch-`, `delete-`)는 feature/widget 레이어에서 `useMutation`에 직접 사용하므로 함께 export한다.

```typescript
// index.ts
export { chatQueries } from './chat-queries';
export { deleteChat } from './delete-chat';
export { postChat } from './post-chat';
export { patchChatTitle } from './patch-chat-title';
```

## 컴포넌트/훅에서 사용 방법

`queries` 객체의 `queryOptions`를 `useQuery`에 직접 전달한다.
별도 커스텀 훅 래퍼 없이도 사용 가능하다.

```typescript
// 컴포넌트에서 직접 사용
const { data, isLoading, error } = useQuery(chatQueries.list(params));
const { data: detail } = useQuery(chatQueries.detail(id));

// 커스텀 훅이 필요한 경우 (파생 로직이 있을 때만)
export function useChatList(params?: ChatListQuery) {
  return useQuery(chatQueries.list(params));
}
```

커스텀 훅 래퍼는 파생 데이터 계산이나 여러 query를 조합할 때만 만든다.
단순히 `useQuery`를 감싸는 용도라면 컴포넌트에서 직접 쓴다.

## 원칙

- mutation은 `queries` 객체에 포함하지 않는다. feature/widget에서 `useMutation`으로 직접 사용
- `select`로 데이터 변환 시 mapper 함수를 활용해 변환 로직을 재사용
- 쿼리 키는 `all`부터 계층적으로 구성해 상위 키 invalidate로 관련 쿼리 전체를 무효화할 수 있게 한다
