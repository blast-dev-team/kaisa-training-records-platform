import { apiClient } from '@/src/shared/api'
import type { MembershipGradeDto } from './dto/trainee-dto'
import { mapMembershipGrade } from './map-trainee'
import type { MembershipGradeUpdateInput, MembershipGrade } from '../model/trainee'

export const patchMembershipGrade = async (
  gradeId: string,
  input: MembershipGradeUpdateInput,
): Promise<MembershipGrade> => {
  const { data } = await apiClient.patch<MembershipGradeDto>(`/membership-grades/${gradeId}`, input)
  return mapMembershipGrade(data)
}
