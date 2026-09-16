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
      r => !query.status || r.status === query.status,
    )
    return mockPage(filtered, query.page, query.limit)
  }
  const { data } = await apiClient.get<PagedResponse<IdentityReviewDto>>('/identity-reviews', {
    params: {
      status: query.status || undefined,
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
