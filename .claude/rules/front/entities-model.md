---
description: "Entities model 폴더 - zod 스키마 및 타입 정의 패턴"
paths:
  - "src/entities/**/model/**"
---

# Entities Model 패턴

## 역할

`model/`은 프론트에서 실제로 사용하는 도메인 타입을 정의한다.
mapper가 API 응답을 변환한 결과가 이 model의 Schema/Type이 된다.

## 흐름

```
API 응답 → dto (백엔드 원본 타입) → mapper → model (Schema/Type) → 컴포넌트/훅에서 사용
```

dto는 백엔드 응답을 그대로 반영한 타입(snake_case)이고, model은 프론트에서 쓸 도메인 타입(camelCase)이다.

## 네이밍 규칙

- zod 스키마: `(엔티티명)Schema`
- 추출 타입: `(엔티티명)Type`

```typescript
// model/chat-title-list.ts
import { z } from 'zod';

export const ChatTitleListSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export type ChatTitleListType = z.infer<typeof ChatTitleListSchema>;
```

mapper는 dto 타입을 받아 이 Schema로 변환한다.

```typescript
// mapper/map-chat-title-list.ts
import { ChatTitleListSchema, ChatTitleListType } from '../model/chat-title-list';
import { ChatTitleListDto } from '../dto/chat-title-list-dto';

export const mapChatTitleList = (item: ChatTitleListDto): ChatTitleListType | undefined => {
  const result = ChatTitleListSchema.safeParse({
    sessionId: item.session_id,
    title: item.title || 'Untitled',
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  });
  if (!result.success) {
    console.error('[mapChatTitleList] 파싱 실패:', result.error);
    return undefined;
  }
  return result.data;
};
```

## zod를 사용할 수 없는 경우

단순한 타입이면 `interface`/`type`으로 정의하되 네이밍은 동일하게 `(엔티티명)Type`을 따른다.

```typescript
export interface ChatTitleListType {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
}
```

## 파일 분리 기준

용도가 다른 모델은 파일을 분리한다.

```
model/
├── chat-title-list.ts   # 목록
├── chat-detail.ts       # 상세
└── chat-update.ts       # 수정 요청
```

## 원칙

- model은 순수한 타입/스키마 정의만. 비즈니스 로직 금지
- 필드명은 camelCase (API 응답의 snake_case는 mapper에서 변환)
- Schema는 `const`로, Type은 `type`으로 export
