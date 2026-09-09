import { apiClient } from '@/src/shared/api'
import type { MembershipGradeDto } from './dto/trainee-dto'
import { mapMembershipGrade } from './map-trainee'
import type { MembershipGradeCreateInput, MembershipGrade } from '../model/trainee'

export const postMembershipGrade = async (
  input: MembershipGradeCreateInput,
): Promise<MembershipGrade> => {
  const { data } = await apiClient.post<MembershipGradeDto>('/membership-grades', input)
  return mapMembershipGrade(data)
}
