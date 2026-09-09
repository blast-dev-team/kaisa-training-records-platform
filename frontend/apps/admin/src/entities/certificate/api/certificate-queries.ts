import { queryOptions } from '@tanstack/react-query'
import { getCertificateList } from './get-certificate-list'
import { getPricingRuleList } from './get-pricing-rule-list'
import type { CertificateListQuery, PricingRuleListQuery } from './query/certificate-list-query'

export const certificateQueries = {
  all: () => ['certificates'] as const,
  lists: () => [...certificateQueries.all(), 'list'] as const,
  list: (query: CertificateListQuery) =>
    queryOptions({
      queryKey: [...certificateQueries.lists(), query],
      queryFn: () => getCertificateList(query),
    }),
}

export const pricingRuleQueries = {
  all: () => ['certificate-pricing-rules'] as const,
  lists: () => [...pricingRuleQueries.all(), 'list'] as const,
  list: (query: PricingRuleListQuery) =>
    queryOptions({
      queryKey: [...pricingRuleQueries.lists(), query],
      queryFn: () => getPricingRuleList(query),
    }),
}
