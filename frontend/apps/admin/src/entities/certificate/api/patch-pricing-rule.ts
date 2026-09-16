import { apiClient } from '@/src/shared/api'
import type { PricingRuleDto } from './dto/certificate-dto'
import { mapPricingRule } from './map-certificate'
import type { PricingRuleUpdateInput, PricingRule } from '../model/certificate'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_PRICING_RULES } from './certificate-mock'

export const patchPricingRule = async (
  ruleId: string,
  input: PricingRuleUpdateInput,
): Promise<PricingRule> => {
  if (USE_MOCK) {
    await mockDelay()
    const rule = MOCK_PRICING_RULES.find(r => r.id === ruleId)
    if (!rule) throw new Error('가격 규칙을 찾을 수 없어요')
    if (input.price_krw !== undefined) rule.priceKrw = input.price_krw
    if (input.valid_to !== undefined) rule.validTo = input.valid_to
    if (input.is_active !== undefined) rule.isActive = input.is_active
    return { ...rule }
  }
  const { data } = await apiClient.patch<PricingRuleDto>(
    `/certificate-pricing-rules/${ruleId}`,
    input,
  )
  return mapPricingRule(data)
}
