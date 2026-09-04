---
description: "Supabase 사용 시 패턴 (PostgreSQL + Supabase SDK). Prisma 대신 Supabase를 사용하는 프로젝트에 적용."
paths:
  - "**/*supabase*"
  - "**/*.supabase.ts"
---

# Supabase Guidelines

Prisma 대신 Supabase를 사용할 때 적용한다.

## 클라이언트 초기화

서버와 클라이언트에서 사용하는 키가 다르다.

```typescript
// 서버 (API Route, Server Component, NestJS 등)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // RLS 우회 가능, 서버에서만 사용
)

// 클라이언트 컴포넌트 (브라우저)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // RLS 정책 적용됨
)
```

- `SERVICE_ROLE_KEY` 는 절대 클라이언트에 노출 금지
- 클라이언트에서 민감한 작업은 항상 서버 API를 통해 처리

## 쿼리 패턴

### 조회

```typescript
// 단건
const { data, error } = await supabase
  .from('users')
  .select('id, email, name')
  .eq('id', userId)
  .single()

// 목록 + 관계
const { data, error } = await supabase
  .from('posts')
  .select('*, author:users(id, name), tags(*)')
  .eq('status', 'published')
  .order('created_at', { ascending: false })
  .range(0, 19) // 페이지네이션

if (error) throw new Error(error.message)
```

### 삽입 / 수정 / 삭제

```typescript
// 삽입 후 결과 반환
const { data, error } = await supabase
  .from('posts')
  .insert({ title, content, author_id: userId })
  .select()
  .single()

// 수정
const { data, error } = await supabase
  .from('posts')
  .update({ title, updated_at: new Date().toISOString() })
  .eq('id', postId)
  .select()
  .single()

// 삭제
const { error } = await supabase
  .from('posts')
  .delete()
  .eq('id', postId)

// Upsert
const { data, error } = await supabase
  .from('profiles')
  .upsert({ id: userId, bio }, { onConflict: 'id' })
  .select()
  .single()
```

## 에러 처리

모든 Supabase 쿼리는 `error`를 반드시 체크한다.

```typescript
const { data, error } = await supabase.from('users').select()

if (error) throw new Error(error.message)
// 이후 data는 null이 아님이 보장됨
```

PGRST 에러코드로 세부 처리가 필요한 경우:

```typescript
if (error) {
  if (error.code === 'PGRST116') throw new NotFoundException('리소스를 찾을 수 없어요')
  throw new Error(error.message)
}
```

## RLS (Row Level Security)

```sql
-- 예시: 본인 데이터만 조회 허용
CREATE POLICY "Users can view own data"
ON users FOR SELECT
USING (auth.uid() = id);
```

- 서버: `service_role` 키 → RLS 우회 (전체 접근)
- 클라이언트: `anon` 키 → RLS 정책 적용
- 민감한 CRUD 작업은 반드시 서버에서 처리

## Storage

```typescript
// 업로드
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.png`, file, {
    upsert: true,
    contentType: 'image/png',
  })

// 공개 URL 조회
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl(`${userId}/avatar.png`)

const url = data.publicUrl
```

- 공개 버킷: 이미지, 첨부파일 등 공개 접근 가능한 파일
- 비공개 버킷: `createSignedUrl` 로 임시 접근 URL 발급

## 실시간 구독 (Realtime)

```typescript
const channel = supabase
  .channel('room-updates')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => {
      setMessages((prev) => [...prev, payload.new as Message])
    }
  )
  .subscribe()

// 컴포넌트 언마운트 시 구독 해제
return () => { supabase.removeChannel(channel) }
```

## 타입 생성

Supabase CLI로 DB 스키마에서 TypeScript 타입 자동 생성.

```bash
supabase gen types typescript --project-id <project-id> > src/types/supabase.ts
```

생성된 타입 활용:

```typescript
import type { Database } from '@/types/supabase'
type User = Database['public']['Tables']['users']['Row']
type UserInsert = Database['public']['Tables']['users']['Insert']
```
