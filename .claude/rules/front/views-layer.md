---
description: "Views 레이어 (페이지) 구조, 데이터 페칭, 서버/클라이언트 경계"
paths:
  - "src/views/**"
---

# Views Layer (페이지 레이어)

페이지 단위의 UI와 로직을 관리한다. FSD 방식을 따른다.

## 구조

```
views/
└── (페이지명)/             예: vehicles, vehicle-detail
    ├── ui/                 렌더링만 — JSX 컴포넌트 파일
    ├── model/              타입, 상수, 도메인 로직 (순수 함수)
    └── index.ts            외부 공개 barrel (필요 시)
```

## ui / model / lib 역할 분리

### `ui/` — 렌더링 전용
- JSX를 반환하는 컴포넌트만 위치
- `const STATUS_LABELS = {...}` 같은 상수 정의 금지
- `function calcStatus() {}` 같은 순수 함수 정의 금지
- `interface Foo {}` 타입 선언 금지 (임시 로컬 타입도 model로)

### `model/` — 타입 · 상수 · 도메인 로직
- 타입/인터페이스: `interface MaintenanceLog`, `type Status`
- 표시 레이블 상수: `STATUS_LABELS`, `FUEL_LABELS`, `TABS`
- 도메인 계산 함수: `calcRegStatus()`, `buildChecklist()`
- 날짜 포맷 등 뷰 전용 순수 함수: `formatDate()`, `dDay()`
- `index.ts` 하나로 묶거나 기능별 파일 분리 가능

```
views/vehicle-detail/
├── model/
│   └── index.ts    ← TABS, RENTAL_TYPE_LABELS, MaintenanceLog 타입, formatDate 등
└── ui/
    └── vehicle-detail-page.tsx   ← import { TABS, formatDate } from '../model'
```

### 공유 범위에 따른 위치 결정

| 범위 | 위치 |
|---|---|
| 여러 view에서 중복 사용 | `entities/(도메인)/model/labels.ts` 또는 `utils.ts` |
| 단일 view 전용 | `views/(페이지)/model/index.ts` |
| 프로젝트 전반 범용 함수 | `shared/utils/` |

```
// ✅ 두 view에서 공유 → entity 레이어
entities/vehicle/model/labels.ts   ← STATUS_LABELS, FUEL_LABELS
entities/vehicle/model/utils.ts    ← calcRegStatus(), daysUntil()

// ✅ 단일 view 전용 → view model
views/vehicle-detail/model/index.ts  ← TABS, formatDate, MaintenanceLog 타입
views/vehicle-purchase/model/index.ts ← DISPOSE_STATUS_LABELS, buildChecklist
```

## page.tsx 역할

- 기본적으로 **서버 컴포넌트**
- 데이터 fetch 를 담당 (`serverFetch` 사용)
- 렌더링할 클라이언트 컴포넌트에 props 로 데이터 전달
- `searchParams`, `params` 를 받아 정렬/필터/날짜 등을 처리

```tsx
// ✅ views/tag/detail/page.tsx (서버 컴포넌트)
export default async function TagDetailPage({ tagId, sort }: Props) {
  const detail = await getTagDetail(tagId, sort);
  if (!detail) notFound();
  return (
    <div>
      <TagHero detail={detail} />
      <SortControl sort={sort} />
      <StreamerGrid streamers={detail.streamers} />
    </div>
  );
}
```

## app 라우트와의 연결

`app/` 디렉토리의 `page.tsx` 는 얇은 래퍼 역할만 한다.

- `params`, `searchParams` 를 파싱해서 view 컴포넌트에 전달
- `generateMetadata` 를 정의해 SEO 메타데이터 제공
- 비즈니스 로직은 view 컴포넌트에 위임

```tsx
// ✅ app/tags/[tagId]/page.tsx (얇은 래퍼)
export default async function Page({ params, searchParams }: Props) {
  const { tagId } = await params;
  const { sort } = await searchParams;
  return <TagDetailPage tagId={parseInt(tagId, 10)} sortParam={sort} />;
}
```

## 서버/클라이언트 경계

- 데이터 fetch → **서버** (page.tsx)
- 인터랙션 (차트, 모달, 폼) → **클라이언트** (`'use client'`, ui/ 폴더)
- 정적 UI (카드, 그리드, 히어로) → **서버** (page.tsx 내 함수 컴포넌트)
- 서버 컴포넌트에서 클라이언트 트리거를 사용할 때 → 트리거 래퍼 패턴

```tsx
// ✅ 서버 페이지에서 클라이언트 모달 사용
// ui/tag-suggest-trigger.tsx ('use client')
export function TagSuggestTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>제안하기</button>
      <TagSuggestModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// page.tsx (서버 컴포넌트)
import { TagSuggestTrigger } from './ui/tag-suggest-trigger';
export default async function Page() {
  return <TagSuggestTrigger />;
}
```

## 페이지 전용 UI 컴포넌트 (ui/)

- 해당 페이지에서만 사용하는 컴포넌트를 `ui/` 에 둔다
- 여러 페이지에서 공유되면 `shared/ui/` 또는 `widget/` 으로 승격
- 서버 컴포넌트인 인라인 함수와 클라이언트 컴포넌트 파일을 구분

## 금지 사항

- ❌ view 에서 다른 view 를 import (views 간 의존성 금지)
- ❌ page.tsx 에서 `'use client'` 직접 선언 (인터랙션은 ui/ 로 분리)
- ❌ page.tsx 에서 axios 직접 호출 (serverFetch 헬퍼 사용)
- ❌ app 라우트 page.tsx 에 비즈니스 로직 작성 (view 로 위임)
- ❌ `ui/` 파일 최상단에 `const LABELS = {...}` 상수 정의 (`model/`로 분리)
- ❌ `ui/` 파일에 `interface`, `type` 선언 (`model/`로 분리)
- ❌ `ui/` 파일에 JSX 없는 순수 함수 정의 (`model/`로 분리)
