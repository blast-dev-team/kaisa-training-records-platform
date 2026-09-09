import { apiClient } from '@/src/shared/api'
import type { PricingRuleDto } from './dto/certificate-dto'
import { mapPricingRule } from './map-certificate'
import type { PricingRuleInput, PricingRule } from '../model/certificate'

export const postPricingRule = async (input: PricingRuleInput): Promise<PricingRule> => {
  const { data } = await apiClient.post<PricingRuleDto>('/certificate-pricing-rules', input)
  return mapPricingRule(data)
}
