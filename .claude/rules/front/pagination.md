# 테이블 페이지네이션 규칙

## 표준

- **기본 페이지 크기: 20개**
- **방식: 서버 사이드 페이지네이션** — 클라이언트 사이드 slice 금지
- 모든 테이블 목록 페이지는 이 규칙을 따른다

## 서버 요청 파라미터

```
GET /api/resources?page=1&limit=20&...filters
```

- `page`: 1부터 시작
- `limit`: 기본 20 (명시적으로 다른 값이 필요한 경우만 변경)
- 필터 변경 시 반드시 `page: 1`로 초기화

## 응답 형태

```typescript
{
  items: T[]
  total: number
  page: number
  limit: number
}
```

## VehicleListFilters 패턴

```typescript
// entities/xxx/model/xxx.ts
export interface XxxListFilters {
  // 서버 지원 필터만 포함
  status?: string
  search?: string
  page?: number
}
```

## 컴포넌트 패턴

```typescript
// 하나의 filters state로 서버 파라미터 통합 관리
const [filters, setFilters] = useState<XxxListFilters>({ page: 1 })

// 필터 변경 → page 1로 리셋
const handleFilterChange = (key: string, value: string) => {
  setFilters(prev => ({ ...prev, [key]: value || undefined, page: 1 }))
}

// 페이지 변경만
const handlePageChange = (newPage: number) => {
  setFilters(prev => ({ ...prev, page: newPage }))
}

const { data, isLoading } = useQuery(xxxQueries.list(filters))
const items = data?.items ?? []
const total = data?.total ?? 0
const totalPages = Math.max(1, Math.ceil(total / 20))
```

## 금지

- ❌ `limit=1000` 으로 전체 로드 후 클라이언트 slice
- ❌ 클라이언트 사이드에서 page 상태 + slice 로 페이지네이션
- ❌ 로컬 필터와 서버 필터 혼용으로 total count 불일치
- ❌ 서버 미지원 필터를 `XxxListFilters`에 포함

## 서버 미지원 필터 처리

텍스트 기반 드롭다운(제조사명, 모델명 등)처럼 BE에서 ID 기반으로만 지원하는 필터는
실 API 연동 시 별도 처리. MSW 단계에서는 해당 필터를 제거하고 search로 대체.
