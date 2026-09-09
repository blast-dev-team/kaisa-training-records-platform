import { apiClient } from '@/src/shared/api'
import type { MembershipGradeDto } from './dto/trainee-dto'
import { mapMembershipGrade } from './map-trainee'
import type { MembershipGrade } from '../model/trainee'

export const getMembershipGradeList = async (isActive?: boolean): Promise<MembershipGrade[]> => {
  const { data } = await apiClient.get<MembershipGradeDto[]>('/membership-grades', {
    params: { is_active: isActive },
  })
  return data.map(mapMembershipGrade)
}
