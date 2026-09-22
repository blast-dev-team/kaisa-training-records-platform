---
description: "프론트엔드 에러 처리 패턴 - API 에러, Error Boundary, TanStack Query"
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Error Handling — Frontend

공통 원칙(메시지 기준, 레이어별 책임)은 `common/error-handling.md` 참고.

## API 에러 처리

```typescript
// fetch 사용 시 — 응답 상태 체크 후 명확한 에러 throw
async function fetchUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}
```

axios interceptor를 쓰는 경우 `shared/api/instance.ts` 에서 에러 변환 처리.
catch절은 `unknown` 타입으로 받는다 (`typescript-standards.md` 참고).

## TanStack Query 에러

`useQuery` / `useMutation` 의 `error` 는 `Error | null` 타입.

```tsx
const { data, error } = useQuery(userQueries.detail(id))

if (error) {
  return <ErrorMessage message={error.message} />
}
```

`useMutation` 에러는 `onError` 콜백 또는 컴포넌트에서 처리:

```tsx
const mutation = useMutation({
  mutationFn: submitForm,
  onError: (error) => {
    setErrorMessage(error.message)
  },
})
```

## Error Boundary

- **앱 최상단**: 예상치 못한 전체 크래시 방어
- **주요 섹션별**: 한 영역의 에러가 전체 UI를 망가뜨리지 않도록

```tsx
<ErrorBoundary fallback={<SectionError />}>
  <ChannelList />
</ErrorBoundary>
```

Next.js App Router 에서는 `error.tsx` 파일로 Error Boundary 역할 수행.

## 사용자 피드백 기준

| 상황 | 처리 방법 |
|------|----------|
| 데이터 로딩 실패 | 인라인 에러 메시지 + 재시도 버튼 |
| 폼 제출 실패 | 폼 하단 에러 메시지 |
| 인증 필요 | 로그인 리다이렉트 |
| 예상치 못한 에러 | Error Boundary fallback + 새로고침 유도 |

## 금지 사항

- 빈 catch (`catch {}`)
- `console.error` 만 하고 사용자 피드백 없음
- 에러 메시지에 내부 스택 트레이스 노출
