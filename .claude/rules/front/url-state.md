# URL 상태 관리 (조회 화면의 단일 진실)

리스트/조회 화면의 **필터·검색·정렬·페이지·탭 상태는 URL 쿼리스트링을 단일 진실(source of truth)**로 둔다.
로컬 `useState` 로 필터를 들고 있다가 URL 과 어긋나게 하지 않는다.

> 서버 상태는 TanStack Query, 전역 UI 상태는 Zustand — 그 구분은 `state-management.md`.
> 이 문서는 그중 **"공유·북마크 가능해야 하는 조회 상태 = URL"** 부분을 구체화한다.
> 페이지네이션 세부는 `pagination.md`.

## 왜 URL 인가

- **공유·북마크**: 링크만 주면 같은 필터 화면이 그대로 열린다 (딥링크, 화면 간 이동 시 필터 전달)
- **뒤로/앞으로가기**가 필터 히스토리로 자연스럽게 동작
- **새로고침해도 상태 유지**
- URL 파라미터가 그대로 **TanStack Query 쿼리키**가 되어 캐시·동기화가 깔끔

## 표준 파라미터 이름 (컨벤션 — 새로 짓지 말 것)

| 용도 | URL 키 | 비고 |
|------|--------|------|
| 날짜 범위 | `from` / `to` | `YYYY-MM-DD`. 빈값 = 필터 해제(전체). **`cf/ct`, `start/end` 등 새 이름 금지** |
| 페이지 | `page` | 1부터. 기본 1이면 생략 |
| 페이지 크기 | `limit` | 기본 20 (`pagination.md`) |
| 검색어 | `q` | debounce 후 반영, 빈값이면 키 삭제 |
| 상태 필터 | `status` | 엔티티 상태값 |
| 탭 | `tab` | 기본 탭이면 생략 |
| 담당자 | `assignee` (id) / `mine=1` | 상호 배타 |
| 정렬 | `sort` / `order` | 기본 정렬이면 생략 |

- 백엔드 API 파라미터명(`date_from`, `confirmed_from` 등)과 **URL 키는 별개**다. URL 은 항상 위 표준 키를 쓰고, 쿼리 함수에서 API 파라미터로 매핑한다.

## 원칙

1. **필터 변경 → `page` 리셋(1)**. 페이지만 바꿀 땐 유지. (`pagination.md`)
2. **빈값 = 필터 해제**: 값이 없으면 키를 URL 에서 **삭제**한다. 빈 문자열 키를 남기지 않는다.
3. **기본 날짜 범위는 마운트 시 1회 URL 에 주입**해 공유 링크 재현성을 확보한다. 기본값은 화면별로 다름(예: 문의=최근 7일, 납부=당월, 운영관리=최근 1년).
4. **기본값은 "활성 필터"로 취급하지 않는다** — 기본과 같으면 초기화 칩/버튼을 노출하지 않는다.
5. 날짜 범위 UI 는 공용 **`PeriodRangePicker`**(`shared/ui/period-range-picker.tsx`)를 쓴다. `<input type="date">` 2개로 직접 만들지 않는다.

## 패턴

```tsx
import { useSearchParams } from 'react-router'

const [searchParams, setSearchParams] = useSearchParams()

// 읽기 — 없으면 '' (전체)
const from = searchParams.get('from') ?? ''
const to = searchParams.get('to') ?? ''
const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)

// 공통 업데이트 헬퍼 — 빈값/ null 은 키 삭제, 필터 변경 시 page 리셋
const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
  const next = new URLSearchParams(searchParams)
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') next.delete(k)
    else next.set(k, v)
  }
  if (resetPage) next.delete('page')
  setSearchParams(next, { replace: false })
}

// 기본 날짜 범위 1회 주입 (공유 링크 재현성). has() 로 체크 — 빈값이 명시돼 있으면 덮지 않음
const didInit = useRef(false)
useEffect(() => {
  if (didInit.current) return
  didInit.current = true
  if (!searchParams.has('from') && !searchParams.has('to')) {
    const next = new URLSearchParams(searchParams)
    next.set('from', defaultFrom); next.set('to', defaultTo)
    setSearchParams(next, { replace: true })
  }
}, [searchParams, setSearchParams])

// URL → 쿼리 (TanStack Query). API 파라미터로 매핑
const { data } = useQuery(xxxQueries.list({
  date_from: from || undefined, date_to: to || undefined,
  q: q || undefined, page, limit: 20,
}))
```

## 딥링크 (화면 간 필터 전달)

다른 화면으로 보낼 때 표준 키로 쿼리를 실어 보낸다. 기본 날짜 범위에 가려 결과가 비지 않도록,
전체 기간으로 열어야 하면 `from=&to=`(빈값)을 명시한다.

```tsx
// 예: 출고현황 → 운영관리(해당 계약을 전체 기간에서 검색)
<Link to={`/operations/direct?q=${encodeURIComponent(contractNumber)}&from=&to=`}>…</Link>
```

## 금지

- ❌ 조회 상태를 `useState` 로만 들고 URL 미반영 (공유·새로고침 시 소실)
- ❌ 날짜 키를 `cf/ct`, `start/end`, `dateFrom/dateTo` 등 표준 밖 이름으로 신설
- ❌ 빈 문자열 키를 URL 에 남기기 (`?q=&status=`)
- ❌ 클라이언트 slice 페이지네이션 (`pagination.md`)
