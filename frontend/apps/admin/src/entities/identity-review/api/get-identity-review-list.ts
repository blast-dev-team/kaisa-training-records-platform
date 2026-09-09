import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { IdentityReviewDto } from './dto/identity-review-dto'
import { mapIdentityReview } from './map-identity-review'
import type { IdentityReviewListQuery } from './query/identity-review-list-query'
import type { IdentityReview } from '../model/identity-review'

export const getIdentityReviewList = async (
  query: IdentityReviewListQuery,
): Promise<Paged<IdentityReview>> => {
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
