---
description: "React Hooks 설계 원칙 및 사용 규칙"
paths:
  - "**/use*.ts"
  - "**/use*.tsx"
---

# React Hooks Rules

## 커스텀 훅 설계 원칙

### 단일 책임
하나의 훅은 하나의 관심사만 다룬다. 여러 역할이 섞이면 분리한다.

```typescript
// ❌ 너무 많은 역할
function useUserDashboard() { /* 인증 + 데이터 + UI 상태 전부 */ }

// ✅ 역할 분리
function useAuth() { /* 인증만 */ }
function useUserData(userId: string) { /* 데이터만 */ }
```

### 훅 추출 기준
다음 중 하나라도 해당하면 커스텀 훅으로 추출한다:
- 동일한 로직이 2개 이상의 컴포넌트에서 반복됨
- 컴포넌트에서 `useEffect` + 관련 state가 3개 이상 묶임
- 비즈니스 로직이 UI 로직과 섞여 테스트가 어려움

## useState vs useReducer

`useState` 여러 개가 서로 연관돼 함께 바뀌는 경우 `useReducer`로 전환한다.

```typescript
// ❌ 연관된 state가 따로 관리됨 → 불일치 발생 가능
const [isLoading, setIsLoading] = useState(false);
const [data, setData] = useState(null);
const [error, setError] = useState(null);

// ✅ useReducer로 묶기
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Data }
  | { status: 'error'; message: string }

const [state, dispatch] = useReducer(reducer, { status: 'idle' });
```

전환 기준:
- 다음 state가 이전 state에 의존할 때
- 여러 state를 동시에 업데이트해야 할 때
- state 전환 로직을 테스트하고 싶을 때

## 파생 상태 (Derived State)

기존 state나 props로 계산 가능한 값은 별도 state로 만들지 않는다.
`useEffect`로 state를 동기화하는 패턴은 렌더 사이클을 낭비하고 버그를 유발한다.

```typescript
// ❌ useEffect로 state 동기화
const [items, setItems] = useState(initialItems);
const [total, setTotal] = useState(0);
useEffect(() => {
  setTotal(items.reduce((sum, item) => sum + item.price, 0));
}, [items]);

// ✅ 렌더 중에 계산 (단순 계산)
const total = items.reduce((sum, item) => sum + item.price, 0);

// ✅ useMemo (비용이 큰 계산만)
const sortedItems = useMemo(
  () => [...items].sort((a, b) => b.price - a.price),
  [items]
);
```

## useEffect

### 데이터 패칭 금지
`useEffect`에서 직접 API를 호출하지 않는다. 반드시 TanStack Query를 사용한다.

```typescript
// ❌ useEffect로 데이터 패칭
useEffect(() => {
  fetch('/api/users').then(res => res.json()).then(setUsers);
}, []);

// ✅ TanStack Query
const { data: users } = useQuery(userQueries.list());
```

### 클린업 함수
이벤트 리스너, 타이머, 구독은 반드시 클린업한다.

```typescript
useEffect(() => {
  const handler = (e: Event) => { /* ... */ };
  window.addEventListener("resize", handler);
  return () => window.removeEventListener("resize", handler);
}, []);
```

### 의존성 배열
의존성을 의도적으로 생략하지 않는다. eslint-plugin-react-hooks의 경고를 무시하지 않는다.
값이 매 렌더마다 새로 만들어져서 의존성에 넣기 곤란하다면 `useRef` 또는 `useCallback`으로 안정화한다.

```typescript
// ❌ 의존성 생략
useEffect(() => {
  doSomething(value); // value가 바뀌어도 재실행 안 됨
}, []); // eslint-disable-line — 금지

// ✅ 의존성 명시
useEffect(() => {
  doSomething(value);
}, [value]);
```

## 성능 훅 사용 기준

`useCallback`, `useMemo`는 실제 성능 문제가 있을 때만 사용한다. 선제적 최적화는 오히려 코드를 복잡하게 만든다.

적합한 경우:
- 자식 컴포넌트에 함수를 props로 전달하고, 그 자식이 `React.memo`로 감싸져 있을 때
- 비용이 큰 계산 (대용량 배열 정렬, 복잡한 파생 데이터)

```typescript
// ✅ React.memo 자식에게 전달되는 핸들러
const handleSubmit = useCallback(() => {
  onSubmit(formData);
}, [formData, onSubmit]);

// ❌ 단순 이벤트 핸들러에 불필요한 useCallback
const handleClick = useCallback(() => setOpen(true), []); // 과잉
```

## SSR Safety

브라우저 전용 API 접근 시 반드시 체크한다.

```typescript
// ✅ 초기값에서 체크
const [value, setValue] = useState(() => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
});

// ✅ effect에서 체크
useEffect(() => {
  if (typeof window === "undefined") return;
  // browser-only code
}, []);
```

## 네이밍

- 훅 이름은 `use` 접두사 필수
- 동작을 명확히 표현: `useXxx` (조회), `useSaveXxx` (저장), `useDeleteXxx` (삭제)
- boolean 반환값: `isLoading`, `isOpen`, `hasError`
