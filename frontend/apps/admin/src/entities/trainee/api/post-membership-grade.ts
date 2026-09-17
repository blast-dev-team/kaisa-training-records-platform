import { apiClient } from '@/src/shared/api'
import type { MembershipGradeDto } from './dto/trainee-dto'
import { mapMembershipGrade } from './map-trainee'
import type { MembershipGradeCreateInput, MembershipGrade } from '../model/trainee'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_GRADES } from './trainee-mock'

export const postMembershipGrade = async (
  input: MembershipGradeCreateInput,
): Promise<MembershipGrade> => {
  if (USE_MOCK) {
    await mockDelay()
    const created: MembershipGrade = {
      id: `mgd-${Date.now().toString(36)}`,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sort_order,
      priceKrw: input.price_krw,
      isActive: true,
      createdAt: new Date().toISOString().slice(0, 19),
    }
    MOCK_GRADES.push(created)
    return { ...created }
  }
  const { data } = await apiClient.post<MembershipGradeDto>('/membership-grades', input)
  return mapMembershipGrade(data)
}
