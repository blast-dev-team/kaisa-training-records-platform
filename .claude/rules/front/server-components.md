---
description: "Next.js 서버 컴포넌트 우선 원칙 및 데이터 페칭 패턴"
paths:
  - "app/**/*.tsx"
  - "src/**/*.tsx"
---

# Server Components First

## 기본 원칙

Next.js App Router에서는 **서버 컴포넌트를 기본**으로 사용한다. `'use client'`는 다음 중 하나에 해당할 때만 붙인다:

- 이벤트 핸들러(`onClick`, `onChange`, `onSubmit`)가 필요할 때
- React 훅(`useState`, `useEffect`, `useRef`, `useQuery` 등) 사용
- 브라우저 API (`localStorage`, `window`, `document`) 사용
- Context Provider 소비
- 라이브러리가 클라이언트 전용일 때 (차트, 드래그앤드롭 등)

## 장점

- **API 호출 노출 안 됨** — 브라우저 Network 탭에 백엔드 호출이 안 보임
- **번들 사이즈 감소** — 서버 전용 코드는 클라이언트 JS에 포함되지 않음
- **초기 로딩 빠름** — 완성된 HTML을 바로 내려줌
- **Vercel Data Cache** 활용 가능

## API 클라이언트 구분 규칙

| 컨텍스트 | 사용할 클라이언트 | 이유 |
|----------|-------------------|------|
| **서버 컴포넌트** (views/page.tsx) | `serverFetch` (fetch 기반) | Next.js Data Cache + ISR 활용 |
| **클라이언트 컴포넌트** (features/ui/) | `apiClient` (axios 인스턴스) | interceptor, 에러 변환 |
| **서버 액션 / Route Handler** | `serverFetch` 또는 직접 `fetch` | 서버 환경 |

이 규칙을 지켜야 캐시가 의도대로 작동하고, 브라우저 네트워크 탭에 백엔드 URL 이 노출되지 않는다.

## 데이터 페칭 패턴

### 1. 서버 컴포넌트에서는 `serverFetch` 사용 (axios 금지)

Next.js의 캐싱은 `fetch`를 기반으로 동작한다. axios는 Data Cache 를 우회하므로 서버 컴포넌트에서 사용하지 않는다.

```tsx
// ✅ good — app/companies/page.tsx
import { serverFetch } from "@/src/shared/api/server-fetch";

export default async function Page() {
  const companies = await serverFetch<CompanyType[]>("/companies", {
    revalidate: 300,
    tags: ["companies"],
  });
  return <CompanyList companies={companies} />;
}
```

### 2. `shared/api/server-fetch.ts` 헬퍼 재사용

서버 컴포넌트 전용 fetch 헬퍼를 두고, 일관된 에러 처리와 캐싱을 적용한다.

```typescript
// src/shared/api/server-fetch.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface ServerFetchOptions {
  revalidate?: number;
  tags?: string[];
  cache?: "no-store";  // Data Cache 완전 우회 (실시간 데이터용)
}

export async function serverFetch<T>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<T> {
  const { revalidate = 300, tags, cache } = options;
  const fetchInit: RequestInit =
    cache === "no-store"
      ? { cache: "no-store" }
      : { next: { revalidate, tags } };
  const res = await fetch(`${API_BASE_URL}${path}`, fetchInit);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
```

### 3. 병렬 fetch는 `Promise.all`

서버 컴포넌트에서 여러 데이터가 필요하면 병렬로 호출한다.

```tsx
const [companies, groups] = await Promise.all([
  serverFetch<CompanyType[]>("/companies", { tags: ["companies"] }),
  serverFetch<GroupType[]>("/groups", { tags: ["groups"] }),
]);
```

## 서버/클라이언트 경계 설계

### 패턴: 서버에서 fetch → 클라이언트로 props 전달

차트, 인터랙션이 필요한 컴포넌트도 **데이터 fetch는 서버**에서 한다.

```tsx
// ✅ app/chart/page.tsx (서버 컴포넌트)
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const data = await serverFetch<TimelineType>(`/rankings/timeline?date=${date}`);
  return <ChartView data={data} />;
}

// ✅ src/views/chart/chart-view.tsx
'use client';
export function ChartView({ data }: { data: TimelineType }) {
  // Nivo 차트, 호버, 탭 전환 등 인터랙션
}
```

### 카드/링크는 `<Link>` 사용 (`router.push` 지양)

단순 네비게이션은 `next/link`로 처리하면 서버 컴포넌트로 유지 가능.

```tsx
// ✅ 서버 컴포넌트 유지
import Link from "next/link";

export function CompanyCard({ company }: Props) {
  return <Link href={`/companies/${company.id}`}>...</Link>;
}

// ❌ 'use client' 강제
function CompanyCard({ company }: Props) {
  const router = useRouter();
  return <button onClick={() => router.push(...)}>...</button>;
}
```

## 캐싱 전략

| 데이터 특성 | 캐시 옵션 | 설명 |
|-------------|-----------|------|
| 불변 데이터 (과거 기록, 아카이브) | `revalidate: 300~3600` | 한번 확정되면 변하지 않음. 긴 TTL 안전 |
| 저빈도 변경 (목록, 프로필, 설정) | `revalidate: 60~300` | 수분 단위로 갱신되어도 충분 |
| 고빈도 변경 (현재 시점 데이터) | `cache: 'no-store'` | stale-while-revalidate 함정 회피 |
| 실시간 (채팅, 알림, 라이브 상태) | `cache: 'no-store'` | 매번 fresh. SSE/WebSocket 권장 |

**핵심 원칙**:
- 같은 엔드포인트라도 **조건에 따라 캐시 전략을 분기**할 수 있다 (예: 오늘 = no-store, 과거 = revalidate)
- **stale-while-revalidate 함정**: 저트래픽 시간대에 첫 방문자가 만료된 stale 데이터를 받고, fresh 데이터는 다음 방문자부터 보임. 사용자가 "최신 데이터가 안 보인다" 고 느끼는 원인. 실시간성이 중요한 데이터는 `cache: 'no-store'` 로 회피
- 불변 데이터에 짧은 TTL 을 쓰면 불필요한 백엔드 부하. 반대로 변하는 데이터에 긴 TTL 을 쓰면 UX 저하. **데이터의 변경 빈도에 TTL 을 맞춘다**

### CRUD 후 무효화

Server Action이나 Route Handler에서:

```typescript
import { revalidateTag, revalidatePath } from "next/cache";

revalidateTag("companies");      // 해당 태그 걸린 캐시 전부 무효화
revalidatePath("/companies");     // 경로 단위 무효화
```

## 어드민 예외

`apps/admin`은 CRUD 위주라 TanStack Query + 클라이언트 컴포넌트 유지한다. 서버 컴포넌트는 **공개 서비스(web)** 위주로 적용.

## 체크리스트

페이지를 만들 때 스스로 묻는다:

1. **이벤트 핸들러가 필요한가?** — 아니오 → 서버 컴포넌트
2. **훅을 사용하는가?** — 아니오 → 서버 컴포넌트
3. **데이터 fetch만 하고 렌더링하는가?** — 예 → 서버 컴포넌트
4. **일부만 인터랙션이 필요한가?** — 그 부분만 `'use client'`로 분리, 상위는 서버

## 금지 사항

- ❌ 조회 전용 페이지인데 `'use client'` 달고 `useQuery`로 fetch
- ❌ 서버 컴포넌트에서 axios 직접 호출 (캐싱 안 됨)
- ❌ `useRouter().push()`로 단순 링크 이동 (`<Link>` 사용)
- ❌ 클라이언트 컴포넌트에서 `process.env.API_KEY` 같은 민감 변수 접근
