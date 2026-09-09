import { apiClient } from '@/src/shared/api'
import type { PricingRuleDto } from './dto/certificate-dto'
import { mapPricingRule } from './map-certificate'
import type { PricingRuleUpdateInput, PricingRule } from '../model/certificate'

export const patchPricingRule = async (
  ruleId: string,
  input: PricingRuleUpdateInput,
): Promise<PricingRule> => {
  const { data } = await apiClient.patch<PricingRuleDto>(
    `/certificate-pricing-rules/${ruleId}`,
    input,
  )
  return mapPricingRule(data)
}
