import { apiClient } from '@/src/shared/api'
import type { PricingRuleDto } from './dto/certificate-dto'
import { mapPricingRule } from './map-certificate'
import type { PricingRuleInput, PricingRule } from '../model/certificate'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_PRICING_RULES } from './certificate-mock'

export const postPricingRule = async (input: PricingRuleInput): Promise<PricingRule> => {
  if (USE_MOCK) {
    await mockDelay()
    const created: PricingRule = {
      id: `prc-${Date.now().toString(36)}`,
      membershipGradeId: input.membership_grade_id,
      issueType: input.issue_type,
      priceKrw: input.price_krw,
      currency: input.currency ?? 'KRW',
      validFrom: input.valid_from,
      validTo: input.valid_to ?? null,
      isActive: input.is_active ?? true,
      createdAt: new Date().toISOString().slice(0, 19),
    }
    MOCK_PRICING_RULES.push(created)
    return { ...created }
  }
  const { data } = await apiClient.post<PricingRuleDto>('/certificate-pricing-rules', input)
  return mapPricingRule(data)
}
