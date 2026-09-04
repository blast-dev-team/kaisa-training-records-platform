---
description: "상태 관리 전략 — 서버 상태 vs 클라이언트 상태, Zustand/Context 사용 기준"
paths:
  - "**/*.tsx"
  - "**/*.ts"
  - "**/store/**"
  - "**/stores/**"
---

# State Management

## 상태 분류 기준

상태를 먼저 분류하고, 그에 맞는 도구를 선택한다.

```
서버 상태   → TanStack Query       (API 데이터, 캐싱, 동기화)
전역 UI 상태 → Zustand             (여러 컴포넌트가 공유하는 UI 상태)
지역 상태   → useState / useReducer (컴포넌트 내부에서만 사용)
파생 상태   → 렌더링 중 계산        (다른 상태에서 도출 가능한 값)
```

## 서버 상태 — TanStack Query

API 데이터는 항상 TanStack Query로 관리. `useEffect` + `useState`로 fetch 금지.

→ 패턴은 `tanstack-query.md` 참고

## 전역 클라이언트 상태 — Zustand

### 언제 Zustand를 쓰는가

- 여러 페이지/위젯에 걸쳐 공유되는 UI 상태
- 서버 상태가 아닌 순수 클라이언트 상태
- 컴포넌트 트리와 무관하게 어디서든 접근 필요

```
✅ Zustand가 적합한 경우
- 사이드바 열림/닫힘 (여러 컴포넌트가 제어)
- 선택된 필터/탭 상태 (URL로 표현하기 애매한 경우)
- 토스트/알림 큐
- 모달 스택 관리

❌ Zustand 불필요한 경우
- 한 컴포넌트에서만 쓰는 상태 → useState
- API 데이터 → TanStack Query
- URL에 반영되어야 하는 상태 → searchParams
```

### Zustand 스토어 패턴

```typescript
// store/ui-store.ts
import { create } from 'zustand'

interface UiStore {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}))
```

- 스토어 파일은 `store/` 또는 `shared/store/` 에 위치
- 스토어 훅 이름: `use[Domain]Store`
- 액션은 스토어 내부에 정의 (컴포넌트 밖에서 set 호출 금지)
- 스토어는 도메인별로 분리 (하나의 거대한 전역 스토어 금지)

### 필요한 상태만 구독

```typescript
// ✅ 필요한 것만 선택 (불필요한 리렌더 방지)
const sidebarOpen = useUiStore((s) => s.sidebarOpen)

// ❌ 스토어 전체 구독
const store = useUiStore()
```

## 지역 상태 — useState / useReducer

### useState

단순한 단일 값, 독립적인 상태.

```typescript
const [isOpen, setIsOpen] = useState(false)
const [inputValue, setInputValue] = useState('')
```

### useReducer

관련된 상태가 여러 개거나, 다음 상태가 이전 상태에 의존하는 경우.

```typescript
type Action =
  | { type: 'SET_STEP'; step: number }
  | { type: 'NEXT' }
  | { type: 'RESET' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'NEXT': return { ...state, step: state.step + 1 }
    case 'RESET': return initialState
    default: return state
  }
}
```

→ 자세한 기준은 `react-hooks.md` 참고

## Context API

### 언제 Context를 쓰는가

Zustand 없이 Props Drilling만 해결하면 될 때.

```
✅ Context가 적합한 경우
- 테마 (다크/라이트)
- 현재 로그인 유저 정보 (읽기 전용)
- 특정 컴포넌트 트리에서만 공유되는 설정값

❌ Context 부적합한 경우
- 자주 변경되는 상태 (리렌더 폭탄)
- 전역에서 쓰는 UI 상태 → Zustand
- 서버 데이터 → TanStack Query
```

### Context 패턴

```typescript
const ThemeContext = createContext<'light' | 'dark'>('light')

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
```

## 파생 상태

다른 상태에서 계산할 수 있는 값은 상태로 만들지 않는다.

```typescript
// ❌ 상태 중복
const [items, setItems] = useState<Item[]>([])
const [count, setCount] = useState(0) // items.length와 동기화 필요

// ✅ 렌더링 중 계산
const [items, setItems] = useState<Item[]>([])
const count = items.length

// 비싼 계산만 useMemo
const sortedItems = useMemo(() => [...items].sort(...), [items])
```

## URL 상태

필터, 정렬, 페이지 등 공유/북마크 가능해야 하는 상태는 URL에.

```typescript
// searchParams 활용 (Next.js)
const searchParams = useSearchParams()
const sort = searchParams.get('sort') ?? 'latest'
```

> 리스트/조회 화면의 필터·검색·정렬·페이지 상태를 URL 로 다루는 표준 파라미터 이름
> (`from`/`to`, `page`, `q`, `status`, `tab` …)과 패턴은 **`url-state.md`** 에 정리돼 있다.
