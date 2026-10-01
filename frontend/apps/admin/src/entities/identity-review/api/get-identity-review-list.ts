import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { IdentityReviewDto } from './dto/identity-review-dto'
import { mapIdentityReview } from './map-identity-review'
import type { IdentityReviewListQuery } from './query/identity-review-list-query'
import type { IdentityReview } from '../model/identity-review'
import { USE_MOCK, mockDelay, mockPage } from '@/src/shared/api/mock'
import { MOCK_IDENTITY_REVIEWS } from './identity-review-mock'

export const getIdentityReviewList = async (
  query: IdentityReviewListQuery,
): Promise<Paged<IdentityReview>> => {
  if (USE_MOCK) {
    await mockDelay()
    const filtered = MOCK_IDENTITY_REVIEWS.filter(
      r =>
        (!query.status || r.status === query.status) &&
        (!query.search ||
          [r.userName, r.verifiedName].some(v =>
            v?.toLowerCase().includes(query.search!.toLowerCase()),
          )),
    )
    const sortKey = query.sort === 'reviewed_at' ? 'reviewedAt' : 'createdAt'
    const dir = query.order === 'asc' ? 1 : -1
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      // 처리일시 미정(null)은 방향 무관 맨 뒤 — 서버 nulls_last 와 동일
      if (!av && !bv) return 0
      if (!av) return 1
      if (!bv) return -1
      return av < bv ? -dir : av > bv ? dir : 0
    })
    return mockPage(sorted, query.page, query.limit)
  }
  const { data } = await apiClient.get<PagedResponse<IdentityReviewDto>>('/identity-reviews', {
    params: {
      status: query.status || undefined,
      search: query.search || undefined,
      sort: query.sort || undefined,
      order: query.order || undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapIdentityReview),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
