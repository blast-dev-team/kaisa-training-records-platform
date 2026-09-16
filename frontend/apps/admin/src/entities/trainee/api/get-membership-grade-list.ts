import { apiClient } from '@/src/shared/api'
import type { MembershipGradeDto } from './dto/trainee-dto'
import { mapMembershipGrade } from './map-trainee'
import type { MembershipGrade } from '../model/trainee'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_GRADES } from './trainee-mock'

export const getMembershipGradeList = async (isActive?: boolean): Promise<MembershipGrade[]> => {
  if (USE_MOCK) {
    await mockDelay()
    return MOCK_GRADES.filter(g => isActive === undefined || g.isActive === isActive)
  }
  const { data } = await apiClient.get<MembershipGradeDto[]>('/membership-grades', {
    params: { is_active: isActive },
  })
  return data.map(mapMembershipGrade)
}
