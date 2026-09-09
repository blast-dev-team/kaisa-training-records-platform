import { queryOptions } from '@tanstack/react-query'
import { getIdentityReviewList } from './get-identity-review-list'
import type { IdentityReviewListQuery } from './query/identity-review-list-query'

export const identityReviewQueries = {
  all: () => ['identity-reviews'] as const,
  lists: () => [...identityReviewQueries.all(), 'list'] as const,
  list: (query: IdentityReviewListQuery) =>
    queryOptions({
      queryKey: [...identityReviewQueries.lists(), query],
      queryFn: () => getIdentityReviewList(query),
    }),
}
