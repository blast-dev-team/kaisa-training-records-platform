import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { PricingRuleDto } from './dto/certificate-dto'
import { mapPricingRule } from './map-certificate'
import type { PricingRuleListQuery } from './query/certificate-list-query'
import type { PricingRule } from '../model/certificate'
import { USE_MOCK, mockDelay, mockPage } from '@/src/shared/api/mock'
import { MOCK_PRICING_RULES } from './certificate-mock'

export const getPricingRuleList = async (
  query: PricingRuleListQuery,
): Promise<Paged<PricingRule>> => {
  if (USE_MOCK) {
    await mockDelay()
    const filtered = MOCK_PRICING_RULES.filter(
      r =>
        (!query.membershipGradeId || r.membershipGradeId === query.membershipGradeId) &&
        (!query.issueType || r.issueType === query.issueType) &&
        (query.isActive === undefined || r.isActive === query.isActive),
    )
    return mockPage(filtered, query.page, query.limit)
  }
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
