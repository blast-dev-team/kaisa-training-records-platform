import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { PricingRuleDto } from './dto/certificate-dto'
import { mapPricingRule } from './map-certificate'
import type { PricingRuleListQuery } from './query/certificate-list-query'
import type { PricingRule } from '../model/certificate'

export const getPricingRuleList = async (
  query: PricingRuleListQuery,
): Promise<Paged<PricingRule>> => {
  const { data } = await apiClient.get<PagedResponse<PricingRuleDto>>('/certificate-pricing-rules', {
    params: {
      membership_grade_id: query.membershipGradeId || undefined,
      issue_type: query.issueType || undefined,
      is_active: query.isActive,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapPricingRule),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
